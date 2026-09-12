//! Standalone Rust server declared only as a `[[bin]]` target.

use std::env;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};

const RANDOMNESS: &str = "RANDOMNESS_PLACEHOLDER";

fn respond(stream: &mut TcpStream, status: &str, content_type: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn handle(mut stream: TcpStream) {
    let peer = match stream.try_clone() {
        Ok(peer) => peer,
        Err(_) => return,
    };
    let mut reader = BufReader::new(peer);

    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }

    let target = request_line
        .split_whitespace()
        .nth(1)
        .unwrap_or("/")
        .to_string();
    let path = target.split('?').next().unwrap_or("/");

    match path {
        "/" => respond(
            &mut stream,
            "200 OK",
            "text/html; charset=utf-8",
            &format!("<html><body>framework:bin-target randomness:{RANDOMNESS}</body></html>"),
        ),
        "/api/data" => respond(
            &mut stream,
            "200 OK",
            "application/json",
            &format!("{{\"bin\":\"server\",\"randomness\":\"{RANDOMNESS}\"}}"),
        ),
        _ => respond(
            &mut stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            &format!("not found:bin-target {path}"),
        ),
    }
}

fn main() {
    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let listener = TcpListener::bind(format!("0.0.0.0:{port}")).expect("failed to bind");
    println!("standalone-bin listening on port {port}");

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                std::thread::spawn(move || handle(stream));
            }
            Err(err) => eprintln!("accept error: {err}"),
        }
    }
}
