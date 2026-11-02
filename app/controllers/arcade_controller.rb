# The cabinet page, and the JSON snapshot it polls when the WebSocket is down.
class ArcadeController < ApplicationController
  def show
    @snapshot = begin
      Arcade.new.snapshot
    rescue RedisClient::Error => e
      Rails.logger.warn("Redis unavailable: #{e.class}")
      nil # the page still renders; the service menu says Redis is offline
    end
  end

  def board
    render json: Arcade.new.snapshot
  rescue RedisClient::Error
    render json: { error: "Redis did not answer" }, status: :service_unavailable
  end
end
