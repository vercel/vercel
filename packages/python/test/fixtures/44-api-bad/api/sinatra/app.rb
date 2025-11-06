require 'sinatra'
require 'json'

get '/' do
  content_type :json
  { message: 'sinatra ok' }.to_json
end

get '/:name' do
  content_type :json
  name = params['name'] || 'world'
  { message: "hello #{name}!" }.to_json
end
