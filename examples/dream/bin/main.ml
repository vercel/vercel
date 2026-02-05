(* Dream web application for Vercel deployment *)

let () =
  let port =
    match Sys.getenv_opt "PORT" with
    | Some p -> int_of_string p
    | None -> 3000
  in
  Dream.run ~port ~interface:"127.0.0.1"
  @@ Dream.logger
  @@ Dream.router [
    (* Main route *)
    Dream.get "/" (fun _ ->
      Dream.html {|
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OCaml on Vercel</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    h1 { color: #333; margin-bottom: 10px; }
    .camel { font-size: 64px; margin-bottom: 20px; }
    p { color: #666; line-height: 1.6; }
    a { color: #667eea; }
    .links { margin-top: 30px; }
    .links a {
      display: inline-block;
      margin-right: 20px;
      padding: 10px 20px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 8px;
    }
    .links a:hover { background: #5a6fd6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="camel">🐫</div>
    <h1>OCaml on Vercel</h1>
    <p>This application is built with the <strong>Dream</strong> framework and deployed using the <code>@vercel/ocaml</code> runtime.</p>
    <p>Zero configuration required - just deploy your OCaml project!</p>
    <div class="links">
      <a href="/api/data">API Endpoint</a>
      <a href="/api/time">Current Time</a>
      <a href="/static.html">Static File</a>
    </div>
  </div>
</body>
</html>
|});

    (* JSON API endpoint *)
    Dream.get "/api/data" (fun _ ->
      Dream.json {|{"message": "Hello from OCaml!", "framework": "Dream", "runtime": "@vercel/ocaml"}|});

    (* Another API endpoint showing dynamic content *)
    Dream.get "/api/time" (fun _ ->
      let time = Unix.gettimeofday () in
      let tm = Unix.localtime time in
      let timestamp = Printf.sprintf "%04d-%02d-%02dT%02d:%02d:%02d"
        (tm.Unix.tm_year + 1900)
        (tm.Unix.tm_mon + 1)
        tm.Unix.tm_mday
        tm.Unix.tm_hour
        tm.Unix.tm_min
        tm.Unix.tm_sec
      in
      Dream.json (Printf.sprintf {|{"timestamp": "%s", "unix": %.0f}|} timestamp time));

    (* Health check *)
    Dream.get "/health" (fun _ ->
      Dream.json {|{"status": "ok"}|});
  ]
