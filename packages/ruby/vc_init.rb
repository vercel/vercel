require 'tmpdir'
require 'webrick'
require 'net/http'
require 'base64'
require 'json'

$entrypoint = '__VC_HANDLER_FILENAME'
$framework = ENV['VC_FRAMEWORK']

# Ensure Bundler is initialized so vendored gems under ./vendor are on the load path
begin
  gemfile = File.join(Dir.pwd, 'Gemfile')
  if File.file?(gemfile)
    ENV['BUNDLE_GEMFILE'] ||= gemfile
    ENV['BUNDLE_PATH'] ||= File.join(Dir.pwd, 'vendor', 'bundle')
    require 'bundler/setup'
  end
rescue LoadError
  # Bundler not available; continue without it
end


ENV['RAILS_ENV'] ||= 'production'
ENV['RAILS_LOG_TO_STDOUT'] ||= '1'
ENV['BOOTSNAP_CACHE_DIR'] ||= '/tmp/bootsnap'


# Zero-config fallback: if SECRET_KEY_BASE is not provided by the user,
# and this is a Rails app, use the per-deployment generated value.
if $framework == 'rails' && (ENV['SECRET_KEY_BASE'].nil? || ENV['SECRET_KEY_BASE'].empty?)
  generated = ENV['VC_GENERATED_SECRET_KEY_BASE']
  if generated && !generated.empty?
    ENV['SECRET_KEY_BASE'] = generated
  end
end


class VCRailsErrorRedirector
  def initialize(app)
    @app = app
  end

  def call(env)
    status, headers, body = @app.call(env)
    st = status.to_i
    accepts_html = env["HTTP_ACCEPT"].to_s.include?("text/html")
    is_get_head  = env["REQUEST_METHOD"] == "GET" || env["REQUEST_METHOD"] == "HEAD"
    path_info = env["PATH_INFO"].to_s
    if accepts_html && is_get_head && st >= 400 && st <= 599 && !path_info.match?(/\A\/\d{3}\.html\z/)
      return fetch_and_render_cdn_error(env, headers, st)
    end
    [status, headers, body]
  end

  private

  def fetch_and_render_cdn_error(env, original_headers, status)
    host_header = env['HTTP_HOST'].to_s
    proto = (env['HTTP_X_FORWARDED_PROTO'] || 'https').to_s
    if host_header.start_with?('localhost') || host_header.start_with?('127.0.0.1')
      proto = 'http'
    end
    uri = URI.parse("#{proto}://#{host_header}/#{status}.html")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == 'https'
    http.open_timeout = 0.5
    http.read_timeout = 1.0
    req = env['REQUEST_METHOD'] == 'HEAD' ? Net::HTTP::Head.new(uri.request_uri) : Net::HTTP::Get.new(uri.request_uri)
    req['Accept-Encoding'] = 'identity'
    req['Accept'] = 'text/html'
    req['Accept-Language'] = env['HTTP_ACCEPT_LANGUAGE'].to_s
    if env['HTTP_X_VERCEL_PROTECTION_BYPASS'] && !env['HTTP_X_VERCEL_PROTECTION_BYPASS'].empty?
      req['x-vercel-protection-bypass'] = env['HTTP_X_VERCEL_PROTECTION_BYPASS']
    end
    if env['HTTP_COOKIE'] && !env['HTTP_COOKIE'].empty?
      req['Cookie'] = env['HTTP_COOKIE']
    end
    if env['HTTP_AUTHORIZATION'] && !env['HTTP_AUTHORIZATION'].empty?
      req['Authorization'] = env['HTTP_AUTHORIZATION']
    end
    res = http.request(req)
    if res.code.to_i == 200
      html = res.body.to_s
      new_headers = build_error_headers(original_headers, status, ["Accept", "Accept-Language"], status >= 500 ? "no-store" : "public, s-maxage=60")
      response_body = env['REQUEST_METHOD'] == 'HEAD' ? [] : [html]
      # return [status, new_headers, response_body]
      [status, new_headers, "bruh #{ENV['VERCEL_IPC_PATH']}"]
    else
      raise "Failed to fetch CDN error page: #{res.code.to_i}, #{res.body.to_s}"
    end
  rescue => e
    phrase = (Rack::Utils::HTTP_STATUS_CODES[status] rescue nil) || "Error"
    html_fallback = "<h1>#{status} #{phrase}</h1>#{e.message}"
    new_headers = build_error_headers(original_headers, status, ["Accept"], "no-store")
    response_body = env['REQUEST_METHOD'] == 'HEAD' ? [] : [html_fallback]
    [status, new_headers, response_body]
  end

  def build_error_headers(original_headers, status, vary_additions, cache_control)
    new_headers = original_headers.dup
    new_headers.delete('Content-Length')
    new_headers["Content-Type"] = "text/html; charset=utf-8"
    vary_values = new_headers["Vary"].to_s.split(',').map(&:strip)
    vary_additions.each { |v| vary_values << v unless vary_values.include?(v) }
    new_headers["Vary"] = vary_values.join(', ') unless vary_values.empty?
    new_headers["X-Original-Status"] = status.to_s
    new_headers["Cache-Control"] = cache_control
    new_headers
  end
end


def rack_handler(httpMethod, path, body, headers)
  require 'rack'

  app, _ = Rack::Builder.parse_file($entrypoint)

  # For Rails apps, wrap the Rack app to redirect 4xx/5xx HTML responses
  if $framework == 'rails'
    app = VCRailsErrorRedirector.new(app)
  end

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

  # Net::HTTP doesn't read the set the encoding so we must set manually.
  # Bug: https://bugs.ruby-lang.org/issues/15517
  # More: https://yehudakatz.com/2010/05/17/encodings-unabridged/
  res_headers = res.each_capitalized.to_h
  if res_headers["Content-Type"] && res_headers["Content-Type"].include?("charset=")
    res_encoding = res_headers["Content-Type"].match(/charset=([^;]*)/)[1]
    res.body.force_encoding(res_encoding)
    res.body = res.body.encode(res_encoding)
  end

  {
    :statusCode => res.code.to_i,
    :headers => res_headers,
    :body => res.body.nil? ? "" : res.body,
  }
end

def vc__handler(event:, context:)
  payload = JSON.parse(event['body'])
  path = payload['path']
  headers = payload['headers']

  if ENV['VERCEL_DEBUG']
    puts 'Request Headers: '
    puts headers
  end

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
