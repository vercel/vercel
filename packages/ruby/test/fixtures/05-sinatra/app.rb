require 'sinatra'
require 'cowsay'

get '/*' do
  Cowsay.say('gem:RANDOMNESS_PLACEHOLDER', 'cow')
end
