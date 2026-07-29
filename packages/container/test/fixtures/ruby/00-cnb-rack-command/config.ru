run lambda { |_env|
  [
    200,
    {
      "content-type" => "text/plain",
      "x-command-source" => "vercel",
    },
    ["hello from the Vercel Rack command\n"],
  ]
}
