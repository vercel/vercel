module Cowsay
  module Character

    class Cheese < Base
      def template
        <<-TEMPLATE
   #{@thoughts}
    #{@thoughts}
      _____   _________
     /     \\_/         |
    |                 ||
    |                 ||
   |    ###\\  /###   | |
   |     0  \\/  0    | |
  /|                 | |
 / |        <        |\\ \\
| /|                 | | |
| |     \\_______/   |  | |
| |                 | / /
/||                 /|||
   ----------------|
        | |    | |
        ***    ***
       /___\\  /___\\
        TEMPLATE
      end
    end

  end
end
