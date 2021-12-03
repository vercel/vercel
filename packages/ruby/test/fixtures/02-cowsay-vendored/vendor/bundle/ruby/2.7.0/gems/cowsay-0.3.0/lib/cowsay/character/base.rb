module Cowsay
  module Character

    class Base
      MAX_LINE_LENGTH = 36 unless defined?(MAX_LINE_LENGTH)

      def self.say(message)
        new.say(message)
      end

      def initialize
        @thoughts = '\\'
      end

      def say(message)
        render_balloon(message) + render_character
      end

      def template
        raise '#template should be subclassed'
      end

      private

      def render_character
        template
      end

      def render_balloon(message)
        message_lines = format_message(message)
        line_length = message_lines.max{ |a,b| a.length <=> b.length }.length

        output_lines = []

        output_lines << " #{'_' * (line_length + 2)} "

        message_lines.each do |line|
          # 'Here is your message: %s' % 'hello world'
          # is the same as
          # printf('Here is your message: %s', 'hello world')
          output_lines << "| %-#{line_length}s |" % line
        end

        output_lines << " #{'-' * (line_length + 2)} "
        output_lines << ''

        output_lines.join("\n")
      end

      def format_message(message)
        return [message] if message.length <= MAX_LINE_LENGTH

        lines = []
        words = message.split(/\s/).reject{ |word| word.length.zero? }
        new_line = ''

        words.each do |word|
          new_line << "#{word} "

          if new_line.length > MAX_LINE_LENGTH
            lines << new_line.chomp
            new_line = ''
          end
        end

        lines << new_line.chomp unless new_line.length.zero?

        lines
      end
    end

  end
end
