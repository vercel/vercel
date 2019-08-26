module Cowsay
  module Character

    class Sheep < Base
      def template
        <<-TEMPLATE
  #{@thoughts}
   #{@thoughts}
       __
      UooU\\.'\@\@\@\@\@\@`.
      \\__/(\@\@\@\@\@\@\@\@\@\@)
           (\@\@\@\@\@\@\@\@)
           `YY~~~~YY'
            ||    ||
        TEMPLATE
      end
    end

  end
end
