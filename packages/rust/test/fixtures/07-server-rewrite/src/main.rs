use std::env;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};

fn handle(mut stream: TcpStream) {
    let peer = match stream.try_clone() {
        Ok(peer) => peer,
        Err(_) => return,
    };
    let mut request_line = String::new();
    if BufReader::new(peer).read_line(&mut request_line).is_err() {
        return;
    }
    let path = request_line.split_whitespace().nth(1).unwrap_or("/");
    let body = format!("{{\"path\":\"{path}\"}}");
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
}

fn main() {
    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let listener = TcpListener::bind(format!("0.0.0.0:{port}")).expect("failed to bind");
    for stream in listener.incoming().flatten() {
        std::thread::spawn(move || handle(stream));
    }
}
