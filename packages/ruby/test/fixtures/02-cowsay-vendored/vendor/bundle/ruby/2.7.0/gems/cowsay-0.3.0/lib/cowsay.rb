require 'cowsay/version'
require 'cowsay/character'

module ::Cowsay
  module_function # all instance methods are available on the module (class) level

  def random_character
    random_class = Character.const_get(character_classes[rand(character_classes.length)])
    random_class.new
  end

  def character_classes
    @character_classes ||= Character.constants.map { |c| c.to_sym } - [:Base, :Template]
  end

  def say(message, character)
    character ||= 'cow'
    if character == 'random'
      random_character.say(message)
    else
      if character_classes.include? character.capitalize.to_sym
        Character.const_get(character.capitalize).say(message)
      else
        puts "No cow file found for #{character}. Use the -l flag to see a list of available cow files."
      end
    end
  end
end
