//! Axum server built by the Rust buildpack.
//!
//! No `vercel_runtime` dependency and no Vercel-specific code: it listens on
//! `0.0.0.0:$PORT` and shuts down on SIGTERM, which the kernel would otherwise
//! ignore for PID 1 and leave the platform to SIGKILL the container.

use std::env;

use axum::{
    extract::Path,
    http::{header, StatusCode},
    response::{Html, IntoResponse},
    routing::{get, post},
    Router,
};
use tokio::signal::unix::{signal, SignalKind};

const RANDOMNESS: &str = "RANDOMNESS_PLACEHOLDER";

const INFO: &str = include_str!("../assets/info.txt");

async fn root() -> impl IntoResponse {
    Html(format!(
        "<html><body>framework:axum randomness:{RANDOMNESS}</body></html>"
    ))
}

async fn info() -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "text/plain; charset=utf-8")], INFO)
}

async fn item(Path(id): Path<u32>) -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/json")],
        format!("{{\"item\":{{\"id\":{id},\"name\":\"Sample Item {id}\"}}}}"),
    )
}

async fn echo(body: String) -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/json")],
        format!("{{\"body\":{body}}}"),
    )
}

async fn boom() -> impl IntoResponse {
    (StatusCode::INTERNAL_SERVER_ERROR, "boom:axum")
}

async fn fallback(uri: axum::http::Uri) -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        format!("not found:axum {}", uri.path()),
    )
}

async fn shutdown_signal() {
    signal(SignalKind::terminate())
        .expect("install SIGTERM handler")
        .recv()
        .await;
    println!("axum-fixture received SIGTERM, shutting down");
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(root))
        .route("/static/info.txt", get(info))
        .route("/api/items/{id}", get(item))
        .route("/api/echo", post(echo))
        .route("/api/boom", get(boom))
        .fallback(fallback);

    let port = env::var("PORT").expect("PORT must be set");
    println!("axum-fixture listening on port {port}");
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .unwrap();

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}
