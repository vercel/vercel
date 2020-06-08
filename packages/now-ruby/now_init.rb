require 'tmpdir'
require 'webrick'
require 'net/http'
require 'base64'
require 'json'

$entrypoint = '__NOW_HANDLER_FILENAME'

ENV['RAILS_ENV'] ||= 'production'
ENV['RAILS_LOG_TO_STDOUT'] ||= '1'

def rack_handler(httpMethod, path, body, headers)
  require 'rack'

  app, _ = Rack::Builder.parse_file($entrypoint)
  server = Rack::MockRequest.new app

  env = headers.transform_keys { |k| k.split('-').join('_').prepend('HTTP_').upcase }
  res = server.request(httpMethod, path, env.merge({ :input => body }))

  {
    :statusCode => res.status,
    :headers => res.original_headers,
    :body => res.body,
  }
end

def webrick_handler(httpMethod, path, body, headers)
  require_relative $entrypoint

  if not Object.const_defined?('Handler')
    return { :statusCode => 500, :body => 'Handler not defined in lambda' }
  end

  host = '0.0.0.0'
  port = 3000

  server = WEBrick::HTTPServer.new :BindAddress => host, :Port => port

  if Handler.is_a?(Proc)
    server.mount_proc '/', Handler
  else
    server.mount '/', Handler
  end

  th = Thread.new(server) do |server|
    server.start
  end

  http = Net::HTTP.new(host, port)
  res = http.send_request(httpMethod, path, body, headers)

  Signal.list.keys.each do |sig|
    begin
      Signal.trap(sig, cleanup)
    rescue
    end
  end

  server.shutdown
  Thread.kill(th)
  
  res_headers = res.each_capitalized.to_h
  res_encoding = "UTF-8"
  if res_headers["Content-Type"] && res_headers["Content-Type"].include?("charset=")
    res_encoding = res_headers["Content-Type"].match(/charset=([^;]*)/)[1]
  end

  {
    :statusCode => res.code.to_i,
    :headers => res_headers,
    :body => res.body.force_encoding(res_encoding),
  }
end

def now__handler(event:, context:)
  payload = JSON.parse(event['body'])
  path = payload['path']
  headers = payload['headers']
  httpMethod = payload['method']
  encoding = payload['encoding']
  body = payload['body']

  if (not body.nil? and not body.empty?) and (not encoding.nil? and encoding == 'base64')
    body = Base64.decode64(body)
  end

  if $entrypoint.end_with? '.ru'
    return rack_handler(httpMethod, path, body, headers)
  end

  return webrick_handler(httpMethod, path, body, headers)
end
