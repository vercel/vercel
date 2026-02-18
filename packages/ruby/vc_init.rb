require 'tmpdir'
require 'webrick'
require 'net/http'
require 'base64'
require 'json'
require 'uri'

$entrypoint = '__VC_HANDLER_FILENAME'

ENV['RAILS_ENV'] ||= 'production'
ENV['RACK_ENV'] ||= 'production'
ENV['RAILS_LOG_TO_STDOUT'] ||= '1'

# Returns an empty string when unset/blank/root ("/"), otherwise:
# - always starts with "/"
# - has no trailing slash
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

# Split an HTTP request-target into [path, query].
#
# Supports:
# - origin-form: "/a/b?x=1"
# - absolute-form: "https://example.com/a/b?x=1"
# - asterisk-form: "*"
def split_request_target(target)
  return ['/', ''] if target.nil? || target.empty?

  begin
    parsed = URI.parse(target)
    if parsed.scheme && parsed.host
      path = parsed.path.nil? || parsed.path.empty? ? '/' : parsed.path
      return [path, parsed.query.to_s]
    end
  rescue URI::InvalidURIError
  end

  return ['*', ''] if target == '*'

  path, query = target.split('?', 2)
  path = '/' if path.nil? || path.empty?
  path = "/#{path}" unless path.start_with?('/')
  [path, query.to_s]
end

# Strip the configured service route prefix from a request path.
#
# Returns:
# - stripped path passed to the user app
# - matched mount prefix (empty when no prefix matched)
def strip_service_route_prefix(path)
  return [path, ''] if path == '*'

  normalized_path = path.nil? || path.empty? ? '/' : path
  normalized_path = "/#{normalized_path}" unless normalized_path.start_with?('/')

  prefix = $service_route_prefix
  return [normalized_path, ''] if prefix.empty?

  return ['/', prefix] if normalized_path == prefix

  if normalized_path.start_with?("#{prefix}/")
    stripped = normalized_path[prefix.length..]
    return [stripped.nil? || stripped.empty? ? '/' : stripped, prefix]
  end

  [normalized_path, '']
end

# Apply service-prefix stripping to a full request-target.
#
# Returns:
# - updated request-target (path + optional query)
# - matched mount prefix for Rack SCRIPT_NAME (or "")
def apply_service_route_prefix_to_target(target)
  path, query = split_request_target(target)
  path, script_name = strip_service_route_prefix(path)
  updated = query.empty? ? path : "#{path}?#{query}"
  [updated, script_name]
end

$service_route_prefix = if service_route_prefix_strip_enabled?
  normalize_service_route_prefix(ENV['VERCEL_SERVICE_ROUTE_PREFIX'])
else
  ''
end

def rack_handler(httpMethod, path, body, headers, script_name = '')
  require 'rack'

  app, _ = Rack::Builder.parse_file($entrypoint)
  server = Rack::MockRequest.new app

  env = headers.transform_keys { |k| k.split('-').join('_').prepend('HTTP_').upcase }
  env['SCRIPT_NAME'] = script_name unless script_name.empty?
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

  path, script_name = apply_service_route_prefix_to_target(path)

  if $entrypoint.end_with? '.ru'
    return rack_handler(httpMethod, path, body, headers, script_name)
  end

  return webrick_handler(httpMethod, path, body, headers)
end
