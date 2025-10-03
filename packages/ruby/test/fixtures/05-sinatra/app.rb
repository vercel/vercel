require 'sinatra'
require 'cowsay'
require 'json'

get '/*' do
  cwd = Dir.pwd
  result = { cwd: cwd, entries: [] }

  Dir.entries(cwd).sort.each do |entry|
    next if entry == '.' || entry == '..'
    path = File.join(cwd, entry)
    if File.directory?(path)
      files = Dir.entries(path).reject { |f| f == '.' || f == '..' }
      result[:entries] << { type: 'dir', name: entry, files: files }
    else
      result[:entries] << { type: 'file', name: entry }
    end
  end

  content_type :json
  puts "CWD: #{cwd}"
  puts "Entries: #{result[:entries].map { |e| e[:name] }.inspect}"
  result.to_json
end
