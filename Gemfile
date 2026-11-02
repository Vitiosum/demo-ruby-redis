source "https://rubygems.org"

gem "rails", "~> 8.1.4"
# Modern asset pipeline (CSS, JS, fonts are fingerprinted at build time)
gem "propshaft"
# ES modules in the browser without a JavaScript build step
gem "importmap-rails"
# App server: the Clever Cloud Ruby runtime starts it (CC_RACKUP_SERVER=puma)
gem "puma", ">= 5.0"
# The only datastore of the app: Redis, reached through the add-on's REDIS_URL
gem "redis", "~> 6.0"

# Windows does not include zoneinfo files, so bundle the tzinfo-data gem
gem "tzinfo-data", platforms: %i[ windows jruby ]
