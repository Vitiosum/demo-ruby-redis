ENV["RAILS_ENV"] ||= "test"
# Tests talk to a real local Redis. Database 15 is flushed before each test.
ENV["REDIS_URL"] ||= "redis://localhost:6379/15"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    parallelize(workers: 1) # one shared Redis database

    setup { Arcade.redis.call("FLUSHDB") }
  end
end
