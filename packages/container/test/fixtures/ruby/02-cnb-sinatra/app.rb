require "json"
require "sinatra/base"

class BuildpackSinatra < Sinatra::Base
  get "/health" do
    content_type :json
    JSON.generate(
      message: "hello from Sinatra buildpacks",
      sinatra_version: Sinatra::VERSION
    )
  end
end
