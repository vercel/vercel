(* vc-init.ml - Bootstrap wrapper for standalone OCaml servers on Vercel

   The bootstrap:
   1. Connects to VERCEL_IPC_PATH Unix socket
   2. Starts the user's server on an internal port
   3. Sends "server-started" IPC message
   4. Reverse proxies requests to user's server
   5. Handles /_vercel/ping health check
   6. Sends "end" IPC message after each request
*)

open Unix

(* IPC state *)
let ipc_socket : file_descr option ref = ref None
let start_time = ref 0.0

(* JSON helpers - minimal, no external deps *)
let json_string s =
  let buf = Buffer.create (String.length s + 2) in
  Buffer.add_char buf '"';
  String.iter (fun c ->
    match c with
    | '"' -> Buffer.add_string buf "\\\""
    | '\\' -> Buffer.add_string buf "\\\\"
    | '\n' -> Buffer.add_string buf "\\n"
    | '\r' -> Buffer.add_string buf "\\r"
    | '\t' -> Buffer.add_string buf "\\t"
    | c -> Buffer.add_char buf c
  ) s;
  Buffer.add_char buf '"';
  Buffer.contents buf

let json_int n = string_of_int n

let json_obj pairs =
  "{" ^ (String.concat ", " (List.map (fun (k, v) ->
    Printf.sprintf "\"%s\": %s" k v) pairs)) ^ "}"

(* Send IPC message (JSON + null byte) *)
let send_ipc_message json =
  match !ipc_socket with
  | None -> ()
  | Some fd ->
    let msg = json ^ "\x00" in
    let len = String.length msg in
    let rec write_all offset =
      if offset < len then
        let written = write_substring fd msg offset (len - offset) in
        write_all (offset + written)
    in
    try write_all 0 with _ -> ()

(* Connect to IPC socket *)
let connect_ipc () =
  match Sys.getenv_opt "VERCEL_IPC_PATH" with
  | None -> () (* Running locally, no IPC *)
  | Some path ->
    let fd = socket PF_UNIX SOCK_STREAM 0 in
    connect fd (ADDR_UNIX path);
    ipc_socket := Some fd

(* Find a free port *)
let find_free_port () =
  let fd = socket PF_INET SOCK_STREAM 0 in
  setsockopt fd SO_REUSEADDR true;
  bind fd (ADDR_INET (inet_addr_loopback, 0));
  let port = match getsockname fd with
    | ADDR_INET (_, p) -> p
    | _ -> failwith "unexpected address"
  in
  close fd;
  port

(* Wait for server to be ready *)
let rec wait_for_server port timeout =
  if timeout <= 0.0 then failwith "Server timeout"
  else try
    let fd = socket PF_INET SOCK_STREAM 0 in
    connect fd (ADDR_INET (inet_addr_loopback, port));
    close fd
  with _ ->
    Unix.sleepf 0.05;
    wait_for_server port (timeout -. 0.05)

(* Read a line from input channel, handling \r\n *)
let read_http_line ic =
  let line = input_line ic in
  if String.length line > 0 && line.[String.length line - 1] = '\r' then
    String.sub line 0 (String.length line - 1)
  else
    line

(* HTTP proxy implementation *)
let proxy_request client_fd user_port =
  let client_in = in_channel_of_descr client_fd in
  let client_out = out_channel_of_descr client_fd in

  (* Read request line *)
  let request_line = read_http_line client_in in

  (* Parse headers, extract Vercel internal headers *)
  let invocation_id = ref "" in
  let request_id = ref "" in
  let headers = Buffer.create 1024 in
  let content_length = ref 0 in

  let rec read_headers () =
    let line = read_http_line client_in in
    if line = "" then ()
    else begin
      let lower = String.lowercase_ascii line in
      (* Extract and remove internal headers *)
      if String.length lower > 35 &&
         String.sub lower 0 35 = "x-vercel-internal-invocation-id: " then
        invocation_id := String.trim (String.sub line 35 (String.length line - 35))
      else if String.length lower > 31 &&
              String.sub lower 0 31 = "x-vercel-internal-request-id: " then
        request_id := String.trim (String.sub line 31 (String.length line - 31))
      else if not (String.length lower > 18 &&
                   String.sub lower 0 18 = "x-vercel-internal-") then begin
        Buffer.add_string headers (line ^ "\r\n");
        if String.length lower > 16 &&
           String.sub lower 0 16 = "content-length: " then
          content_length := int_of_string (String.trim
            (String.sub line 16 (String.length line - 16)))
      end;
      read_headers ()
    end
  in
  read_headers ();

  (* Check for health check *)
  let parts = String.split_on_char ' ' request_line in
  let path = if List.length parts >= 2 then List.nth parts 1 else "/" in

  if path = "/_vercel/ping" then begin
    output_string client_out "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK";
    flush client_out
  end else begin
    (* Proxy to user's server *)
    let user_fd = socket PF_INET SOCK_STREAM 0 in
    connect user_fd (ADDR_INET (inet_addr_loopback, user_port));
    let user_in = in_channel_of_descr user_fd in
    let user_out = out_channel_of_descr user_fd in

    (* Forward request *)
    output_string user_out (request_line ^ "\r\n");
    output_string user_out (Buffer.contents headers);
    output_string user_out "\r\n";
    if !content_length > 0 then begin
      let body = Bytes.create !content_length in
      really_input client_in body 0 !content_length;
      output_bytes user_out body
    end;
    flush user_out;

    (* Forward response *)
    let rec copy () =
      let buf = Bytes.create 4096 in
      let n = input user_in buf 0 4096 in
      if n > 0 then begin
        output client_out buf 0 n;
        copy ()
      end
    in
    (try copy () with End_of_file -> ());
    flush client_out;
    close user_fd;

    (* Send IPC end message *)
    if !invocation_id <> "" then begin
      let req_id = try int_of_string !request_id with _ -> 0 in
      send_ipc_message (json_obj [
        ("type", json_string "end");
        ("payload", json_obj [
          ("context", json_obj [
            ("invocationId", json_string !invocation_id);
            ("requestId", json_int req_id)
          ]);
          ("error", "null")
        ])
      ])
    end
  end

let () =
  start_time := Unix.gettimeofday ();

  (* Connect to IPC *)
  (try connect_ipc () with e ->
    prerr_endline ("Warning: IPC connect failed: " ^ Printexc.to_string e));

  (* Find free port for user's server *)
  let user_port = find_free_port () in

  (* Start user's server *)
  if not (Sys.file_exists "./user-server") then begin
    prerr_endline "Error: user-server not found";
    exit 1
  end;

  let env = Array.append (Unix.environment ())
    [| Printf.sprintf "PORT=%d" user_port |] in
  let pid = create_process_env "./user-server" [| "./user-server" |] env
    stdin stdout stderr in

  (* Wait for ready *)
  (try wait_for_server user_port 30.0 with e ->
    prerr_endline ("Server failed to start: " ^ Printexc.to_string e);
    kill pid Sys.sigkill;
    exit 1);

  (* Send server-started *)
  let init_duration = int_of_float
    ((Unix.gettimeofday () -. !start_time) *. 1000.0) in
  send_ipc_message (json_obj [
    ("type", json_string "server-started");
    ("payload", json_obj [
      ("initDuration", json_int init_duration);
      ("httpPort", json_int 3000)
    ])
  ]);

  if !ipc_socket = None then
    Printf.printf "Listening on :3000 (proxy to :%d)\n%!" user_port;

  (* Start server *)
  let server_fd = socket PF_INET SOCK_STREAM 0 in
  setsockopt server_fd SO_REUSEADDR true;
  bind server_fd (ADDR_INET (inet_addr_loopback, 3000));
  listen server_fd 128;

  (* Accept loop *)
  while true do
    let client_fd, _ = accept server_fd in
    (try proxy_request client_fd user_port with e ->
      prerr_endline ("Request error: " ^ Printexc.to_string e));
    close client_fd
  done
