//! Standalone Rust server with no dependencies.
//!
//! The whole contract of standalone mode is: listen on `$PORT`, speak HTTP. This
//! fixture does that with nothing but `std`, so it proves the mode works without
//! any particular HTTP library.

use std::env;
use std::io::{BufRead, BufReader, Read, Write};
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

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let target = parts.next().unwrap_or("/").to_string();

    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 {
            break;
        }
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            break;
        }
        if let Some(value) = trimmed.to_lowercase().strip_prefix("content-length:") {
            content_length = value.trim().parse().unwrap_or(0);
        }
    }

    let mut raw_body = vec![0u8; content_length];
    if content_length > 0 && reader.read_exact(&mut raw_body).is_err() {
        return;
    }
    let body = String::from_utf8_lossy(&raw_body).to_string();

    let (path, query) = match target.split_once('?') {
        Some((path, query)) => (path, query),
        None => (target.as_str(), ""),
    };

    match path {
        "/" => respond(
            &mut stream,
            "200 OK",
            "text/html; charset=utf-8",
            &format!("<html><body>framework:std randomness:{RANDOMNESS}</body></html>"),
        ),
        "/api/method" => respond(
            &mut stream,
            "200 OK",
            "text/plain; charset=utf-8",
            &format!("method:{method}"),
        ),
        "/api/query" => respond(
            &mut stream,
            "200 OK",
            "text/plain; charset=utf-8",
            &format!("query:{query}"),
        ),
        "/api/echo" => respond(
            &mut stream,
            "200 OK",
            "application/json",
            // `body` is already JSON; interpolate it raw rather than with `{:?}`,
            // which would escape it into a string.
            &format!("{{\"body\":{body}}}"),
        ),
        "/api/boom" => respond(
            &mut stream,
            "500 Internal Server Error",
            "text/plain; charset=utf-8",
            "boom:std",
        ),
        _ => respond(
            &mut stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            &format!("not found:std {path}"),
        ),
    }
}

fn main() {
    // The platform assigns the port; the IPC proxy injects it as `PORT`.
    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let listener = TcpListener::bind(format!("0.0.0.0:{port}")).expect("failed to bind");
    println!("standalone-std listening on port {port}");

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                std::thread::spawn(move || handle(stream));
            }
            Err(err) => eprintln!("accept error: {err}"),
        }
    }
}
