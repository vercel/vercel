run lambda { |_env|
  [200, { "content-type" => "text/plain" }, ["wrong Procfile command\n"]]
}
