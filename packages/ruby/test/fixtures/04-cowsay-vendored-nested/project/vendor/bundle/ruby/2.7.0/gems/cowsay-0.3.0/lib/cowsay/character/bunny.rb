module Cowsay
  module Character

    class Bunny < Base
      def template
        <<-TEMPLATE
  #{@thoughts}
   #{@thoughts}   \\
        \\ /\\
        ( )
      .( o ).
        TEMPLATE
      end
    end

  end
end
