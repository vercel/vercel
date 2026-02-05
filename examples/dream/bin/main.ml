(* Dream web application for Vercel deployment *)

(* Data types for API responses *)
type data_item = {
  id : int;
  name : string;
  value : int;
}

type data_response = {
  data : data_item list;
  total : int;
  timestamp : string;
}

type item_response = {
  item : data_item;
  timestamp : string;
}

(* JSON encoding helpers *)
let json_of_data_item item =
  Printf.sprintf {|{"id": %d, "name": "%s", "value": %d}|}
    item.id item.name item.value

let json_of_data_response resp =
  let items = String.concat ", " (List.map json_of_data_item resp.data) in
  Printf.sprintf {|{"data": [%s], "total": %d, "timestamp": "%s"}|}
    items resp.total resp.timestamp

let json_of_item_response resp =
  Printf.sprintf {|{"item": %s, "timestamp": "%s"}|}
    (json_of_data_item resp.item) resp.timestamp

(* Get current timestamp in RFC3339 format *)
let current_timestamp () =
  let time = Unix.gettimeofday () in
  let tm = Unix.gmtime time in
  Printf.sprintf "%04d-%02d-%02dT%02d:%02d:%02dZ"
    (tm.Unix.tm_year + 1900)
    (tm.Unix.tm_mon + 1)
    tm.Unix.tm_mday
    tm.Unix.tm_hour
    tm.Unix.tm_min
    tm.Unix.tm_sec

(* Sample data *)
let sample_items = [
  { id = 1; name = "Sample Item 1"; value = 100 };
  { id = 2; name = "Sample Item 2"; value = 200 };
  { id = 3; name = "Sample Item 3"; value = 300 };
]

let () =
  let port =
    match Sys.getenv_opt "PORT" with
    | Some p -> int_of_string p
    | None -> 3000
  in
  Dream.run ~port ~interface:"127.0.0.1"
  @@ Dream.logger
  @@ Dream.router [
    (* Serve static files from public directory *)
    Dream.get "/static/**" (Dream.static "public");

    (* Serve index.html at root *)
    Dream.get "/" (fun _ ->
      let ic = open_in "public/index.html" in
      let n = in_channel_length ic in
      let s = really_input_string ic n in
      close_in ic;
      Dream.html s);

    (* API routes *)
    Dream.get "/api/data" (fun _ ->
      let response = {
        data = sample_items;
        total = List.length sample_items;
        timestamp = current_timestamp ();
      } in
      Dream.respond
        ~headers:[("Content-Type", "application/json")]
        (json_of_data_response response));

    Dream.get "/api/items/:id" (fun request ->
      let id_str = Dream.param request "id" in
      let id = try int_of_string id_str with _ -> 1 in
      let response = {
        item = { id; name = "Sample Item " ^ id_str; value = 100 };
        timestamp = current_timestamp ();
      } in
      Dream.respond
        ~headers:[("Content-Type", "application/json")]
        (json_of_item_response response));
  ]
