require 'sinatra'
require 'json'

set :show_exceptions, false

get '/' do
  content_type :json
  JSON.generate(message: 'Hello from Sinatra')
end

get '/health' do
  content_type :json
  JSON.generate(status: 'ok')
end

not_found do
  content_type :json
  status 404
  JSON.generate(detail: '404 from Sinatra')
end
