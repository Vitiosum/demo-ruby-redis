class HealthController < ActionController::API
  # Liveness: never touches Redis, so a Redis outage does not restart the app.
  def show
    render json: { status: "ok" }
  end

  # Readiness of the add-on: one PING through the pool.
  def deep
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    pong = Arcade.new.ping
    render json: { status: "ok", redis: pong, ms: ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round(2) }
  rescue RedisClient::Error => e
    render json: { status: "error", redis: e.class.name }, status: :service_unavailable
  end
end
