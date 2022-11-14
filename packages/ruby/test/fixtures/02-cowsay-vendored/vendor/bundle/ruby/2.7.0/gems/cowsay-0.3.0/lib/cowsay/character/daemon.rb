module Cowsay
  module Character

    class Daemon < Base
      def template
        <<-TEMPLATE
   #{@thoughts}         ,        ,
    #{@thoughts}       /(        )`
     #{@thoughts}      \\ \\___   / |
            /- _  `-/  '
           (/\\/ \\ \\   /\\
           / /   | `    \\
           O O   ) /    |
           `-^--'`<     '
          (_.)  _  )   /
           `.___/`    /
             `-----' /
<----.     __ / __   \\
<----|====O)))==) \\) /====
<----'    `--' `.__,' \\
             |        |
              \\       /
        ______( (_  / \\______
      ,'  ,-----'   |        \\
      `--{__________)        \\/
        TEMPLATE
      end
    end

  end
end
