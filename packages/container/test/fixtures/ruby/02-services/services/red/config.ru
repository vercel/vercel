require "json"

run lambda { |env|
  path = env.fetch("PATH_INFO")
  status = ["/", "/health"].include?(path) ? 200 : 404
  [
    status,
    { "content-type" => "application/json", "x-ruby-fixture" => "red" },
    [JSON.generate(service: "red", path: path, ruby_version: RUBY_VERSION)],
  ]
}
