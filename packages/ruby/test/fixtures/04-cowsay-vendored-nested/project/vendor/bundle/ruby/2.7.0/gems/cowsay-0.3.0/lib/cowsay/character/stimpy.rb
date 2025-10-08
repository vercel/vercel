module Cowsay
  module Character

    class Stimpy < Base
      def template
        <<-TEMPLATE
  #{@thoughts}     .    _  .
   #{@thoughts}    |\\_|/__/|
       / / \\/ \\  \\
      /__|O||O|__ \\
     |/_ \\_/\\_/ _\\ |
     | | (____) | ||
     \\/\\___/\\__/  //
     (_/         ||
      |          ||
      |          ||\\
       \\        //_/
        \\______//
       __ || __||
      (____(____)
        TEMPLATE
      end
    end

  end
end
