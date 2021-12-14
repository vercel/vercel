module Cowsay
  module Character

    class Stegosaurus < Base
      def template
        <<-TEMPLATE
#{@thoughts}                             .       .
 #{@thoughts}                           / `.   .' "
  #{@thoughts}                  .---.  <    > <    >  .---.
   #{@thoughts}                 |    \\  \\ - ~ ~ - /  /    |
         _____          ..-~             ~-..-~
        |     |   \\~~~\\.'                    `./~~~/
       ---------   \\__/                        \\__/
      .'  O    \\     /               /       \\  "
     (_____,    `._.'               |         }  \\/~~~/
      `----.          /       }     |        /    \\__/
            `-.      |       /      |       /      `. ,~~|
                ~-.__|      /_ - ~ ^|      /- _      `..-'
                     |     /        |     /     ~-.     `-. _  _  _
                     |_____|        |_____|         ~ - . _ _ _ _ _>
        TEMPLATE
      end
    end

  end
end
