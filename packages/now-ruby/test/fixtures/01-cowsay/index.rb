require 'webrick'
require 'cowsay'

class Handler < WEBrick::HTTPServlet::AbstractServlet
  def do_GET req, res
    res.status = 200
    res['Content-Type'] = 'text/plain'
    res.body = Cowsay.say('gem:RANDOMNESS_PLACEHOLDER', 'cow')
  end
end
