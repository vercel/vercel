module Cowsay
  module Character
    autoload :Base,   'cowsay/character/base'
  end
end

Dir[File.expand_path('character/*.rb', File.dirname(__FILE__))].each do |character|
  require character
end
