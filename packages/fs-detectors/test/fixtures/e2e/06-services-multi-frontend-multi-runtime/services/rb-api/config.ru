require "sinatra"
require "json"

get "/api/rb" do
  content_type :json
  JSON.generate(message: "Hello from Sinatra")
end

get "/api/rb/ping" do
  content_type :json
  JSON.generate(message: "pong from Sinatra")
end

not_found do
  content_type :json
  status 404
  JSON.generate(detail: "404 from Sinatra")
end

run Sinatra::Application
