module Cowsay
  module Character

    class Frogs < Base
      def template
        <<-TEMPLATE
     #{@thoughts}
      #{@thoughts}
          oO)-.                       .-(Oo
         /__  _\\                     /_  __\\
         \\  \\(  |     ()~()         |  )/  /
          \\__|\\ |    (-___-)        | /|__/
          '  '--'    ==`-'==        '--'  '
        TEMPLATE
      end
    end

  end
end
