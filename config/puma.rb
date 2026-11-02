# Puma configuration. On Clever Cloud, the Ruby runtime starts Puma behind
# NGINX (port 8080) and sets workers and threads from the instance size
# (override with CC_PUMA_WORKERS / CC_PUMA_THREADS). Locally: port 3000.
threads_count = ENV.fetch("RAILS_MAX_THREADS", 3)
threads threads_count, threads_count

port ENV.fetch("PORT", 3000)

# Allow puma to be restarted by `bin/rails restart` command.
plugin :tmp_restart

pidfile ENV["PIDFILE"] if ENV["PIDFILE"]
