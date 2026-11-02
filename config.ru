# This file is used by Rack-based servers to start the application.

require_relative "config/environment"

# Seed the default high-score tables at startup. Idempotent, and a Redis
# outage must not stop the app from booting (/health stays green).
begin
  Arcade.new.seed!
rescue RedisClient::Error => e
  Rails.logger.warn("Seed skipped, Redis unavailable: #{e.class}")
end

run Rails.application
Rails.application.load_server
