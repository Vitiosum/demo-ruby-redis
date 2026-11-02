require "test_helper"

class ArcadeFlowTest < ActionDispatch::IntegrationTest
  include ActionCable::TestHelper

  test "GET /health answers without Redis" do
    get "/health"
    assert_response :success
    assert_equal "ok", response.parsed_body["status"]
  end

  test "GET /health/deep pings Redis" do
    get "/health/deep"
    assert_response :success
    assert_equal "PONG", response.parsed_body["redis"]
  end

  test "the cabinet page renders with the board" do
    get "/"
    assert_response :success
    assert_select "canvas#game"
    assert_select "script#boot", /CLV|SET/
  end

  test "POST /scores writes, broadcasts, and GET /board reads it back" do
    assert_broadcasts(Arcade::CHANNEL, 1) do
      post "/scores", params: { score: { initials: "neo", score: 12_345, hits: 33, expired: 3, combo: 20 } }, as: :json
    end
    assert_response :created
    game = response.parsed_body["game"]
    assert_equal "NEO", game["i"]
    assert_equal 1, game["rank_today"]
    assert_equal "PUBLISH", game["commands"].last["cmd"].split.first

    get "/board"
    assert_response :success
    assert_includes response.parsed_body["today"], { "i" => "NEO", "s" => 12_345 }
    assert_equal 1, response.parsed_body["games"]
  end

  test "POST /scores refuses an invalid game" do
    post "/scores", params: { score: { initials: "N3O", score: 10, hits: 1, expired: 0, combo: 1 } }, as: :json
    assert_response :unprocessable_content
  end
end
