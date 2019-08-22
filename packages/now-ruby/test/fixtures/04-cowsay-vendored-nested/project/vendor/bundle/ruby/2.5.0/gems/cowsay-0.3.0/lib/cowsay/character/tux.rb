module Cowsay
  module Character

    class Tux < Base
      def template
        <<-TEMPLATE
   #{@thoughts}
    #{@thoughts}
        .--.
       |o_o |
       |:_/ |
      //   \\ \\
     (|     | )
    /'\\_   _/`\\
    \\___)=(___/
        TEMPLATE
      end
    end

  end
end
