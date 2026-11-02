module ApplicationCable
  # Anonymous viewers: the arcade has no login.
  class Connection < ActionCable::Connection::Base
  end
end
