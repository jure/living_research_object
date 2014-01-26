var express = require('express');
var app = express();
var http = require('http');
var server = http.createServer(app);
var Twit = require('twit');
var io = require('socket.io').listen(server);
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('experiment-result.sqlite');
var db_archive = new sqlite3.Database('experiment-archive.sqlite');

var request = require('request');

db.run("CREATE TABLE IF NOT EXISTS tweets (timestamp INTEGER, tweet TEXT)");
db.run("CREATE TABLE IF NOT EXISTS metadata (id INTEGER, tweets INTEGER, clouds INTEGER)");
db.run("CREATE TABLE IF NOT EXISTS clouds (timestamp INTEGER PRIMARY KEY UNIQUE, coverage INTEGER)");
db_archive.run("CREATE TABLE IF NOT EXISTS tweets (data TEXT)");
db_archive.run("CREATE TABLE IF NOT EXISTS weather (data TEXT)");

setInterval(function() {
    request('http://api.openweathermap.org/data/2.5/weather?id=5391959&units=metric', function(error, response, body) {
        if (!error && response.statusCode === 200) {
            console.log(body);
            var data = JSON.parse(body);
            if (data !== null && data.clouds !== undefined) {
                db_archive.run("INSERT INTO weather VALUES(?)", JSON.stringify(data));
                db.get("SELECT * FROM clouds WHERE timestamp = ?", data.dt, function(err, row) {
                    if (row === undefined) {
                        db.run("UPDATE metadata SET clouds=clouds + 1 WHERE id = 1");
                        db.run("INSERT OR IGNORE INTO clouds VALUES(?,?)", data.dt, data.clouds.all);
                        io.sockets.emit("clouds", [data.dt, data.clouds.all]);
                    }
                });

                console.log("Clouds are: " + data.clouds.all);
            }
        }
    });
}, 300 * 1000);

server.listen(8080);

var locations = ['-122.75', '36.8', '-121.75', '37.8'];

var T = new Twit({
    consumer_key: process.env.LRO_TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.LRO_TWITTER_CONSUMER_SECRET,
    access_token: process.env.LRO_TWITTER_ACCESS_TOKEN,
    access_token_secret: process.env.LRO_TWITTER_ACCESS_TOKEN_SECRET
});

var stream = T.stream('statuses/filter', {
    locations: locations
});

stream.on('tweet', function(tweet) {
    var timestamp = new Date(Date.parse(tweet.created_at)).getTime() / 1000;
    io.sockets.emit('processed', [timestamp, tweet.text]);
    db_archive.run("INSERT INTO tweets VALUES(?)", JSON.stringify(tweet));
    if (tweet.text.match(/\b(sunny|☀|soleado|sunshine|太陽|sunlight|#sun)\b/i)) {
        io.sockets.emit('tweet', [timestamp, tweet.teaxt]);
        db.run("UPDATE metadata SET tweets=tweets + 1 WHERE id = 1");
        db.run("INSERT INTO tweets VALUES(?,?)", timestamp, tweet.text);
        console.log(tweet.text);
    }
});
io.sockets.on('connection', function(socket) {
    var clouds = [];
    var tweets = [];
    var metadata = [];
    var smtp = 0;
    var anHourAgo = (new Date().getTime() / 1000) - 3600;

    db.each("SELECT * FROM tweets", function(err, row) {
        tweets.push(row);
    }, function() {
        db.each("SELECT * FROM clouds", function(err, row) {
            clouds.push(row);
        }, function() {
            db.each("SELECT * FROM metadata", function(err, row) {
                metadata.push(row);
            }, function() {
                db.each("SELECT COUNT(*) FROM tweets WHERE timestamp >= ?", anHourAgo, function(err, row) {
                    smtp = row['COUNT(*)'];
                }, function() {
                    var current = {
                        clouds: clouds,
                        tweets: tweets,
                        metadata: metadata[0],
                        smtp: smtp
                    };

                    io.sockets.emit('current', JSON.stringify(current));
                    console.log('Connected to client');
                });
            });
        });
    });
});