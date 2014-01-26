require 'sqlite3'
require 'json'
require 'pry'

db = SQLite3::Database.new('experiment-archive.sqlite')
db_result = SQLite3::Database.new('experiment-result.sqlite')

tweets = db.execute('SELECT * FROM tweets')
weather = db.execute('SELECT * FROM weather')

db_result.execute("CREATE TABLE tweets (timestamp INTEGER, tweet TEXT)")
db_result.execute("CREATE TABLE clouds (timestamp INTEGER PRIMARY KEY UNIQUE, coverage INTEGER)")
db_result.execute("CREATE TABLE metadata (id INTEGER, tweets INTEGER, clouds INTEGER)")

weather.map!{|w| JSON.parse(w.first)}
weather_dedup = []
weather.each do |w|
  unless weather_dedup.index(w)
    weather_dedup << w
  end
end

weather_dedup.each do |w|
  db_result.execute('INSERT INTO clouds VALUES (?,?)', w['dt'], w['clouds']['all'])
end

total = tweets.size

db_result.execute('INSERT INTO metadata VALUES (?,?,?)', 1, total, weather_dedup.size)

tweets.each_with_index do |t,i|
  t = JSON.parse(t[0]) 
  time = DateTime.parse(t['created_at']).to_time.to_i

  next if t['text'] =~ /forecast/i # Skip if tweet is a forecast
  if t['text'] =~ /\b(sunny|☀|soleado|sunshine|太陽|sunlight|#sun)\b/i
    db_result.execute('INSERT INTO tweets VALUES (?,?)', time, t['text'])
  end
  puts "#{i} of #{total}"
end

