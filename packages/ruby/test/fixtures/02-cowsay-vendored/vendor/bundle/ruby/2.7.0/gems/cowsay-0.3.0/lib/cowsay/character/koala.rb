module Cowsay
  module Character

    class Koala < Base
      def template
        <<-TEMPLATE
  #{@thoughts}
   #{@thoughts}
       ___
     {~._.~}
      ( Y )
     ()~*~()
     (_)-(_)
        TEMPLATE
      end
    end

  end
end
