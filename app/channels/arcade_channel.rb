# Every open cabinet listens here. Action Cable keeps one Redis SUBSCRIBE
# per server process and fans the messages out to the WebSockets.
class ArcadeChannel < ApplicationCable::Channel
  def subscribed
    stream_from Arcade::CHANNEL
  end
end
