run lambda { |_env|
  [
    200,
    { "content-type" => "text/plain" },
    ["hello from ruby buildpacks\n"],
  ]
}
