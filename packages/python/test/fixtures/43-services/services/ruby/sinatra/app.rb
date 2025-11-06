require 'sinatra'
require 'json'

get '/' do
  content_type :json
  { message: 'sinatra ok' }.to_json
end

get '/bruh' do
  content_type :json
  { message: 'sinatra bruh ok' }.to_json
end


