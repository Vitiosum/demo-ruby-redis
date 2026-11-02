# POST /scores: one finished game. Writes it to Redis, then tells every
# open cabinet through Action Cable (a Redis PUBLISH under the hood).
class ScoresController < ApplicationController
  PUBLISH = "PUBLISH neon_arcade:#{Arcade::CHANNEL} {snapshot}".freeze

  # Free play: no login and no session, so there is nothing to forge.
  skip_forgery_protection

  def create
    arcade   = Arcade.new
    game     = arcade.submit(**score_params)
    snapshot = Arcade.new.snapshot

    # Other screens get the commands plus a last line for the very message they receive.
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    ActionCable.server.broadcast(Arcade::CHANNEL,
      snapshot.merge(game: game.merge(commands: arcade.commands + [ { cmd: PUBLISH, reply: "(this message)", ms: nil } ])))
    ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round(2)

    publish = { cmd: PUBLISH, reply: "via Action Cable", ms: ms }
    render json: snapshot.merge(game: game.merge(commands: arcade.commands + [ publish ])), status: :created
  rescue Arcade::Invalid => e
    render json: { error: e.message }, status: :unprocessable_content
  rescue RedisClient::Error
    render json: { error: "Redis did not answer" }, status: :service_unavailable
  end

  private

  # JSON body: {"score": {"initials": "ZED", "score": 14220, "hits": 31, "expired": 4, "combo": 18}}
  def score_params
    s = params.require(:score)
    { initials: s[:initials].to_s.upcase, score: s[:score], hits: s[:hits], expired: s[:expired], combo: s[:combo] }
  end
end
