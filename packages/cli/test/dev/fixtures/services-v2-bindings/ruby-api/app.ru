# Internal ruby (Rack) service. Only reachable through a service binding.
class RubyApi
  def call(env)
    [200, { 'Content-Type' => 'text/plain' }, ['ruby_api: ok']]
  end
end

run RubyApi.new
