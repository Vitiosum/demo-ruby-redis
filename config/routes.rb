Rails.application.routes.draw do
  root "arcade#show"

  get  "board"  => "arcade#board"   # JSON snapshot: boards, ticker, bookkeeping
  post "scores" => "scores#create"  # one finished game: writes everything to Redis

  get "health"      => "health#show" # 200 without touching Redis
  get "health/deep" => "health#deep" # PING the Redis add-on

  # Action Cable (WebSocket) is mounted on /cable by default.
end
