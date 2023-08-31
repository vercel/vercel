module Cowsay
  module Character

    class Kitty < Base
      def template
        <<-TEMPLATE
     #{@thoughts}
      #{@thoughts}
       ("`-'  '-/") .___..--' ' "`-._
         ` *_ *  )    `-.   (      ) .`-.__. `)
         (_Y_.) ' ._   )   `._` ;  `` -. .-'
      _.. `--'_..-_/   /--' _ .' ,4
   ( i l ),-''  ( l i),'  ( ( ! .-'    
        TEMPLATE
      end
    end

  end
end
