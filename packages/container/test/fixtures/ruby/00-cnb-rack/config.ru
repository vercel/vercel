run lambda { |_env|
  [
    200,
    {
      "content-type" => "text/plain",
    },
    ["hello from the Vercel Rack buildpack\n"],
  ]
}
