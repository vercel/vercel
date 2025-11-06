require './app'

map '/api/sinatra' do
  run Sinatra::Application
end
