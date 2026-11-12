//! Standalone actix-web server.
//!
//! Same contract as the axum fixture, on a different HTTP library and a
//! different async runtime, to show the runtime does not care which you use.

use std::env;

use actix_web::{get, http::header::ContentType, web, App, HttpResponse, HttpServer, Responder};

const RANDOMNESS: &str = "RANDOMNESS_PLACEHOLDER";

const INFO: &str = include_str!("../assets/info.txt");

#[get("/")]
async fn root() -> impl Responder {
    HttpResponse::Ok()
        .content_type(ContentType::html())
        .body(format!(
            "<html><body>framework:actix-web randomness:{RANDOMNESS}</body></html>"
        ))
}

#[get("/static/info.txt")]
async fn info() -> impl Responder {
    HttpResponse::Ok()
        .content_type(ContentType::plaintext())
        .body(INFO)
}

#[get("/api/items/{id}")]
async fn item(id: web::Path<u32>) -> impl Responder {
    HttpResponse::Ok()
        .content_type(ContentType::json())
        .body(format!(
            "{{\"item\":{{\"id\":{id},\"name\":\"Sample Item {id}\"}}}}"
        ))
}

async fn fallback(req: actix_web::HttpRequest) -> impl Responder {
    HttpResponse::NotFound()
        .content_type(ContentType::plaintext())
        .body(format!("not found:actix-web {}", req.path()))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // The platform assigns the port; the IPC proxy injects it as `PORT`.
    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(3000);
    println!("standalone-actix listening on port {port}");

    HttpServer::new(|| {
        App::new()
            .service(root)
            .service(info)
            .service(item)
            .default_service(web::to(fallback))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
