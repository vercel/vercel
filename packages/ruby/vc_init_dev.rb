begin
  require 'bundler/setup'
rescue LoadError
  # Bundler not available; continue
end

require 'rack'
require 'webrick'
require 'stringio'
require 'socket'

RACK_PATH = '__VC_DEV_RACK_PATH__'
HOST = '__VC_DEV_HOST__'

def build_app_from_rack(path)
  builder = Rack::Builder.new
  code = File.read(path)
  builder.instance_eval(code, path)
  builder.to_app
end

app = build_app_from_rack(RACK_PATH)

port = ENV['PORT'].to_i
if port <= 0
  tcp = TCPServer.new(HOST, 0)
  port = tcp.addr[1]
  tcp.close
end

logger = WEBrick::Log.new($stderr, WEBrick::Log::WARN)
server = WEBrick::HTTPServer.new(
  Host: HOST,
  Port: port,
  AccessLog: [],
  Logger: logger
)

server.mount_proc '/' do |req, res|
  env = {
    'REQUEST_METHOD' => req.request_method,
    'SCRIPT_NAME' => '',
    'PATH_INFO' => req.path,
    'QUERY_STRING' => req.query_string || '',
    'SERVER_NAME' => HOST,
    'SERVER_PORT' => port.to_s,
    'rack.version' => Rack::VERSION,
    'rack.url_scheme' => 'http',
    'rack.input' => StringIO.new(req.body ? req.body.to_s : ''),
    'rack.errors' => $stderr,
    'rack.multithread' => false,
    'rack.multiprocess' => false,
    'rack.run_once' => false,
  }
  status, headers, body = app.call(env)
  res.status = status
  headers.each { |k, v| res[k] = v }
  # Ensure Content-Type and Content-Length to avoid client hangs
  res['Content-Type'] ||= 'text/plain'
  res['Connection'] = 'close'
  body_content = +''
  body.each { |chunk| body_content << chunk.to_s }
  res['Content-Length'] ||= body_content.bytesize.to_s
  res.body = body_content
  body.close if body.respond_to?(:close)
end

trap('INT') { server.shutdown }
puts "Listening on http://#{HOST}:#{port}"
server.start
