require 'cowsay'

class ApplicationController < ActionController::Base
    def index
        render plain: Cowsay.say('gem:RANDOMNESS_PLACEHOLDER', 'cow')
    end
end
