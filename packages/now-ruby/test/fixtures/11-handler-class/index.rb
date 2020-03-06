class Handler < WEBrick::HTTPServlet::AbstractServlet
  def do_GET(request, response)
    response.body = "RANDOMNESS_PLACEHOLDER"
  end
end
