module Cowsay
  module Character

    class Elephant < Base
      def template
        <<-TEMPLATE
 #{@thoughts}     /\\  ___  /\\
  #{@thoughts}   // \\/   \\/ \\\\
     ((    O O    ))
      \\\\ /     \\ //
       \\/  | |  \\/
        |  | |  |
        |  | |  |
        |   o   |
        | |   | |
        |m|   |m|
        TEMPLATE
      end
    end

  end
end
