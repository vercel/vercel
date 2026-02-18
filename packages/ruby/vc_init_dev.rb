"""
Auto-generated template used by vercel dev (Ruby, Rack)
Serves static files from PUBLIC_DIR before delegating to the user Rack app.

This file is written to the project at .vercel/ruby/vc_init_dev.rb
and executed by the dev server launcher.
"""

require 'rack'
require 'rack/handler/webrick'
require 'webrick'
require 'socket'

$stdout.sync = true
$stderr.sync = true

USER_ENTRYPOINT = "__VC_DEV_ENTRYPOINT__"
PUBLIC_DIR = 'public'

def normalize_service_route_prefix(raw_prefix)
  return '' if raw_prefix.nil?

  prefix = raw_prefix.strip
  return '' if prefix.empty?

  prefix = "/#{prefix}" unless prefix.start_with?('/')

  if prefix != '/'
    prefix = prefix.sub(%r{/+\z}, '')
    prefix = '/' if prefix.empty?
  end

  prefix == '/' ? '' : prefix
end

def service_route_prefix_strip_enabled?
  raw = ENV['VERCEL_SERVICE_ROUTE_PREFIX_STRIP']
  return false if raw.nil? || raw.empty?

  %w[1 true].include?(raw.downcase)
end

SERVICE_ROUTE_PREFIX = if service_route_prefix_strip_enabled?
  normalize_service_route_prefix(ENV['VERCEL_SERVICE_ROUTE_PREFIX'])
else
  ''
end

def strip_service_route_prefix(path_info)
  normalized_path = path_info.nil? || path_info.empty? ? '/' : path_info
  normalized_path = "/#{normalized_path}" unless normalized_path.start_with?('/')

  prefix = SERVICE_ROUTE_PREFIX
  return [normalized_path, ''] if prefix.empty?

  return ['/', prefix] if normalized_path == prefix

  if normalized_path.start_with?("#{prefix}/")
    stripped = normalized_path[prefix.length..]
    return [stripped.nil? || stripped.empty? ? '/' : stripped, prefix]
  end

  [normalized_path, '']
end

def build_user_app
  if USER_ENTRYPOINT.end_with?('.ru')
    app, _ = Rack::Builder.parse_file(USER_ENTRYPOINT)
    app
  else
    # For dev we only support Rack entrypoints (.ru) to ensure consistent behavior
    abort("Unsupported entrypoint: #{USER_ENTRYPOINT}. Please use a Rack config (.ru) file for vercel dev.")
  end
end

class StaticThenApp
  def initialize(app, public_dir)
    @app = app
    @public_dir = public_dir
    @file_server = Rack::File.new(public_dir)
    @base = File.expand_path(public_dir)
  end

  def call(env)
    effective_env = env.dup
    req_path, matched_prefix = strip_service_route_prefix(
      effective_env['PATH_INFO'] || '/'
    )
    effective_env['PATH_INFO'] = req_path

    unless matched_prefix.empty?
      script_name = effective_env['SCRIPT_NAME'] || ''
      if !script_name.empty? && script_name != '/'
        script_name = script_name.sub(%r{/+\z}, '')
      else
        script_name = ''
      end
      effective_env['SCRIPT_NAME'] = "#{script_name}#{matched_prefix}"
    end

    # Normalize path and guard against traversal
    safe = req_path.sub(/^\//, '')
    full = File.expand_path(safe, @base)

    if full.start_with?(@base + File::SEPARATOR) && File.file?(full)
      # Delegate to Rack::File which handles HEAD/GET correctly
      return @file_server.call(effective_env)
    end

    @app.call(effective_env)
  end
end

def static_then_app(user_app)
  StaticThenApp.new(user_app, PUBLIC_DIR)
end

host = '127.0.0.1'
begin
  sock = TCPServer.new(host, 0)
  port = sock.addr[1]
ensure
  sock&.close
end

app = static_then_app(build_user_app)

logger = WEBrick::Log.new($stderr)
logger.level = WEBrick::Log::WARN
server = WEBrick::HTTPServer.new(
  BindAddress: host,
  Port: port,
  AccessLog: [],
  Logger: logger
)

# Mount the Rack app at root
server.mount '/', Rack::Handler::WEBrick, app

trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }

puts "Serving on http://#{host}:#{server.config[:Port]}"
server.start
