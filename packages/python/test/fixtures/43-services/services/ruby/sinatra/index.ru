require './app'

map '/sinatra' do
  run Sinatra::Application
end
