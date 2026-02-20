require 'uri'

# Normalize a configured service prefix into canonical mount-path form.
#
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

# Return whether service-prefix stripping is explicitly enabled.
#
# Stripping is gated behind a dedicated env var so manually configured
# route prefixes can be preserved by default.
def service_route_prefix_strip_enabled?
  raw = ENV['VERCEL_SERVICE_ROUTE_PREFIX_STRIP']
  return false if raw.nil? || raw.empty?

  %w[1 true].include?(raw.downcase)
end

def resolve_service_route_prefix
  return '' unless service_route_prefix_strip_enabled?

  normalize_service_route_prefix(ENV['VERCEL_SERVICE_ROUTE_PREFIX'])
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
def strip_service_route_prefix(path, prefix)
  return [path, ''] if path == '*'

  normalized_path = path.nil? || path.empty? ? '/' : path
  normalized_path = "/#{normalized_path}" unless normalized_path.start_with?('/')

  normalized_prefix = prefix.to_s
  return [normalized_path, ''] if normalized_prefix.empty?

  return ['/', normalized_prefix] if normalized_path == normalized_prefix

  if normalized_path.start_with?("#{normalized_prefix}/")
    stripped = normalized_path[normalized_prefix.length..]
    return [stripped.nil? || stripped.empty? ? '/' : stripped, normalized_prefix]
  end

  [normalized_path, '']
end

# Apply service-prefix stripping to a full request-target.
#
# Returns:
# - updated request-target (path + optional query)
# - matched mount prefix for Rack SCRIPT_NAME (or "")
def apply_service_route_prefix_to_target(target, prefix)
  path, query = split_request_target(target)
  path, script_name = strip_service_route_prefix(path, prefix)
  updated = query.empty? ? path : "#{path}?#{query}"
  [updated, script_name]
end
