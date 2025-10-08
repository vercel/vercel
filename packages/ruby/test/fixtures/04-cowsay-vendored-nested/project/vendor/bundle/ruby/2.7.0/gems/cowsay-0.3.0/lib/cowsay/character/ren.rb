module Cowsay
  module Character

    class Ren < Base
      def template
        <<-TEMPLATE
   #{@thoughts}
    #{@thoughts}
    ____
   /# /_\\_
  |  |/o\\o\\
  |  \\\\_/_/
 / |_   |
|  ||\\_ ~|
|  ||| \\/
|  |||_
 \\//  |
  ||  |
  ||_  \\
  \\_|  o|
  /\\___/
 /  ||||__
    (___)_)
        TEMPLATE
      end
    end

  end
end
