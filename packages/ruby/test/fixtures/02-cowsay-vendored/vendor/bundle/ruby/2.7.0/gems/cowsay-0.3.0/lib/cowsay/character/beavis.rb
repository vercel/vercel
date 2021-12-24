module Cowsay
  module Character

    class Beavis < Base
      def template
        <<-TEMPLATE
   #{@thoughts}         __------~~-,
    #{@thoughts}      ,'            ,
          /               \\
         /                :
        |                  '
        |                  |
        |                  |
         |   _--           |
         _| =-.     .-.   ||
         o|/o/       _.   |
         /  ~          \\ |
       (____\@)  ___~    |
          |_===~~~.`    |
       _______.--~     |
       \\________       |
                \\      |
              __/-___-- -__
             /            _ \\

        TEMPLATE
      end
    end

  end
end
