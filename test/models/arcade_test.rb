require "test_helper"

class ArcadeTest < ActiveSupport::TestCase
  test "seed is idempotent and fills both boards" do
    2.times { Arcade.new.seed! }
    snapshot = Arcade.new.snapshot

    assert_equal 10, snapshot[:size_all]
    assert_equal 5, snapshot[:size_day]
    assert_equal({ i: "CLV", s: 12_000 }, snapshot[:alltime].first)
    assert_operator snapshot[:ttl], :>, 0, "today's board must expire"
    assert_operator snapshot[:ttl], :<=, 86_400
  end

  test "a game writes the counter, both sorted sets, the TTL and the ticker" do
    game = Arcade.new.submit(initials: "ZED", score: 9_000, hits: 30, expired: 2, combo: 12)
    redis = Arcade.redis

    assert_equal 1, game[:n]
    assert_equal 1, game[:rank_all]
    assert_equal "1", redis.call("GET", Arcade::GAMES)
    assert_equal "9000", redis.call("ZSCORE", Arcade::ALLTIME, "ZED:1")
    today = redis.call("KEYS", "arcade:board:2*").first
    assert_operator redis.call("TTL", today), :>, 0
    assert_equal "ZED", JSON.parse(redis.call("LINDEX", Arcade::TICKER, 0))["i"]
  end

  test "the ticker keeps the last 20 scores only" do
    arcade = Arcade.new
    25.times { |n| arcade.submit(initials: "BOT", score: n * 10, hits: 1, expired: 0, combo: 1) }

    assert_equal 20, Arcade.redis.call("LLEN", Arcade::TICKER)
    assert_equal 240, JSON.parse(Arcade.redis.call("LINDEX", Arcade::TICKER, 0))["s"]
  end

  test "every command is traced with its latency" do
    arcade = Arcade.new
    arcade.submit(initials: "ACE", score: 500, hits: 3, expired: 0, combo: 3)
    names = arcade.commands.map { |c| c[:cmd].split.first }

    assert_equal %w[INCR ZADD ZADD EXPIREAT ZREVRANK ZREVRANK LPUSH LTRIM ZREMRANGEBYRANK], names
    assert arcade.commands.all? { |c| c[:ms].is_a?(Float) }
  end

  test "rejects bad initials and impossible scores" do
    assert_raises(Arcade::Invalid) { Arcade.new.submit(initials: "AB", score: 1, hits: 1, expired: 0, combo: 1) }
    assert_raises(Arcade::Invalid) { Arcade.new.submit(initials: "ABC", score: 99_999, hits: 2, expired: 0, combo: 2) }
  end
end
