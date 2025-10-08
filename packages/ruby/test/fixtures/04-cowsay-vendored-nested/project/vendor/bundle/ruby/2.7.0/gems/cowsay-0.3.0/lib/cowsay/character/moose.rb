module Cowsay
  module Character

    class Moose < Base
      def template
        <<-TEMPLATE
  #{@thoughts}
   #{@thoughts}   \\_\\_    _/_/
    #{@thoughts}      \\__/
           (oo)\\_______
           (__)\\       )\\/\\
               ||----w |
               ||     ||
        TEMPLATE
      end
    end

  end
end
