class RackApp
  def call(env)
    [ 200, { "Content-Type" => "text/plain" }, ["gem:RANDOMNESS_PLACEHOLDER"] ]
  end
end

run RackApp.new
