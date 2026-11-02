# Everything the arcade stores lives in Redis, and every Redis call goes
# through this class. Each call is written as the raw Redis command, so the
# code reads like the "service menu" shown on the page.
#
#   arcade:board:alltime      sorted set  every score ever (top 1000 kept)
#   arcade:board:YYYY-MM-DD   sorted set  today's scores, expires at midnight (Paris)
#   arcade:games_played       counter     INCR once per finished game
#   arcade:ticker             list        the last 20 scores, newest first
class Arcade
  ALLTIME  = "arcade:board:alltime"
  GAMES    = "arcade:games_played"
  TICKER   = "arcade:ticker"
  SEEDED   = "arcade:seeded"
  CHANNEL  = "arcade" # Action Cable broadcasting (Redis channel "neon_arcade:arcade")

  ZONE         = "Europe/Paris"
  KEEP_ALLTIME = 1000
  TICKER_SIZE  = 20
  MAX_SCORE    = 99_999
  INITIALS     = /\A[A-Z]{3}\z/

  # Default high-score tables, like the ones an arcade machine ships with.
  HOUSE_ALLTIME = { "CLV" => 12_000, "RDS" => 10_500, "TTL" => 9_000, "KEY" => 7_800, "ZED" => 6_500,
                    "NEO" => 5_200, "PIX" => 4_100, "BIT" => 3_000, "ACE" => 2_200, "MAX" => 1_500 }.freeze
  HOUSE_TODAY   = { "SET" => 6_000, "GET" => 4_500, "HIT" => 3_200, "EXP" => 2_100, "NIL" => 1_200 }.freeze

  class Invalid < StandardError; end

  # One pool per Puma process, sized like Puma's thread pool.
  def self.redis
    @redis ||= RedisClient.config(
      url: ENV.fetch("REDIS_URL", "redis://localhost:6379/0"),
      protocol: 2, connect_timeout: 1, read_timeout: 1, write_timeout: 1
    ).new_pool(size: ENV.fetch("RAILS_MAX_THREADS", 5).to_i, timeout: 2)
  end

  def initialize(trace = Trace.new(self.class.redis))
    @r = trace
  end

  def commands = @r.entries

  # A finished game: one counter, two sorted sets, one TTL, two ranks, one capped list.
  def submit(initials:, score:, hits:, expired:, combo:)
    validate!(initials, score, hits, expired, combo)
    today  = today_key
    game   = @r.call("INCR", GAMES)
    member = "#{initials}:#{game}"
    entry  = { n: game, i: initials, s: score, h: hits, x: expired, c: combo, t: Time.now.to_i }

    @r.call("ZADD", ALLTIME, score, member)
    @r.call("ZADD", today, score, member)
    @r.call("EXPIREAT", today, midnight.to_i)
    rank_all   = @r.call("ZREVRANK", ALLTIME, member)
    rank_today = @r.call("ZREVRANK", today, member)
    @r.call("LPUSH", TICKER, entry.to_json)
    @r.call("LTRIM", TICKER, 0, TICKER_SIZE - 1)
    @r.call("ZREMRANGEBYRANK", ALLTIME, 0, -(KEEP_ALLTIME + 1))

    entry.merge(rank_all: rank_all + 1, rank_today: rank_today + 1)
  end

  # Everything the page shows, read in one go.
  def snapshot
    today = today_key
    day_size = @r.call("ZCARD", today)
    day_size = seed_today(today) if day_size.zero? # a new day: house scores, like a real cabinet

    {
      alltime:  pairs(@r.call("ZREVRANGE", ALLTIME, 0, 9, "WITHSCORES")),
      today:    pairs(@r.call("ZREVRANGE", today, 0, 4, "WITHSCORES")),
      ticker:   @r.call("LRANGE", TICKER, 0, TICKER_SIZE - 1).map { |json| JSON.parse(json) },
      games:    @r.call("GET", GAMES).to_i,
      size_all: @r.call("ZCARD", ALLTIME),
      size_day: day_size,
      ttl:      @r.call("TTL", today),
      memory:   @r.call("INFO", "memory")[/^used_memory_human:(\S+)/, 1],
      keys:     { alltime: ALLTIME, today: today, ticker: TICKER, games: GAMES },
      reads:    commands
    }
  end

  # Idempotent: runs at every boot, writes only the first time.
  def seed!
    today = today_key
    seed_today(today) if @r.call("ZCARD", today).zero?
    return unless @r.call("SET", SEEDED, Time.now.to_i, "NX")

    HOUSE_ALLTIME.each.with_index(1) do |(initials, score), i|
      @r.call("ZADD", ALLTIME, score, "#{initials}:house-#{i}")
    end
    HOUSE_ALLTIME.to_a.last(5).each do |initials, score|
      @r.call("LPUSH", TICKER, { n: nil, i: initials, s: score, t: Time.now.to_i }.to_json)
    end
  end

  def ping = @r.call("PING")

  private

  # Returns the size of the board after seeding.
  def seed_today(key)
    HOUSE_TODAY.each.with_index(1) { |(initials, score), i| @r.call("ZADD", key, "NX", score, "#{initials}:house-#{i}") }
    @r.call("EXPIREAT", key, midnight.to_i)
    HOUSE_TODAY.size
  end

  def today_key = "arcade:board:#{Time.now.in_time_zone(ZONE).to_date.iso8601}"
  def midnight  = Time.now.in_time_zone(ZONE).tomorrow.beginning_of_day

  # ZREVRANGE ... WITHSCORES replies [member, score, member, score, ...]
  def pairs(reply)
    reply.each_slice(2).map { |member, score| { i: member.split(":").first, s: score.to_i } }
  end

  def validate!(initials, score, hits, expired, combo)
    raise Invalid, "initials must be 3 letters A-Z" unless initials.to_s.match?(INITIALS)
    [score, hits, expired, combo].each { |n| raise Invalid, "counters must be integers" unless n.is_a?(Integer) && n >= 0 }
    raise Invalid, "score out of range" if score > MAX_SCORE || score > hits * 2_500 || hits > 120 || combo > hits
  end

  # Wraps the client: runs a command and remembers it with its round-trip time.
  class Trace
    attr_reader :entries

    def initialize(redis)
      @redis = redis
      @entries = []
    end

    def call(*command)
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      reply = @redis.call(*command)
      ms = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000
      @entries << { cmd: Trace.show(command), reply: Trace.reply(command, reply), ms: ms.round(2) }
      reply
    end

    # Shorten long arguments (the JSON pushed to the ticker) for display.
    def self.show(command)
      command.map { |arg| (s = arg.to_s).length > 34 ? "#{s[0, 31]}..." : s }.join(" ")
    end

    # Format a reply the way redis-cli prints it. INFO shows used_memory_human only.
    def self.reply(command, reply)
      return "used_memory_human:#{reply[/^used_memory_human:(\S+)/, 1]}" if command.first == "INFO"

      case reply
      when Integer then "(integer) #{reply}"
      when nil     then "(nil)"
      when Array   then "(#{reply.size} items)"
      when "OK", "PONG" then reply
      else %("#{show([reply])}")
      end
    end
  end
end
