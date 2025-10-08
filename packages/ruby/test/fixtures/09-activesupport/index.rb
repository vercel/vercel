require 'active_support'
require 'active_support/core_ext'

Handler = Proc.new do |request, response|
  response.status = 200
  response["Content-Type"] = "text/plain"
  response.body = <<-BODY
    10y+ future:
    #{Date.current + 10.years}

    test:
    gem:RANDOMNESS_PLACEHOLDER
  BODY
end
