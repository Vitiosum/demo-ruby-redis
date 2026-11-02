require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = true
  config.consider_all_requests_local = false
  config.action_controller.perform_caching = true

  # Fingerprinted assets (built by CC_RAKEGOALS=assets:precompile) are cached for a year.
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}" }

  # Clever Cloud terminates TLS in front of the app: trust it, and redirect plain HTTP.
  config.assume_ssl = true
  config.force_ssl = true

  # Log to STDOUT so `clever logs` shows everything.
  config.log_tags = [ :request_id ]
  config.logger   = ActiveSupport::TaggedLogging.logger(STDOUT)
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")
  config.silence_healthcheck_path = "/health"

  config.active_support.report_deprecations = false
  config.i18n.fallbacks = true
end
