//! Standalone axum server.
//!
//! No `vercel_runtime` dependency and no Vercel-specific code: it just listens on
//! `$PORT`, and the shared IPC proxy speaks the runtime protocol for it.

use std::env;

use axum::{
    extract::Path,
    http::{header, StatusCode},
    response::{Html, IntoResponse},
    routing::{get, post},
    Router,
};

const RANDOMNESS: &str = "RANDOMNESS_PLACEHOLDER";

// Embedded at compile time, mirroring the Go fixtures' `//go:embed`.
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

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(root))
        .route("/static/info.txt", get(info))
        .route("/api/items/{id}", get(item))
        .route("/api/echo", post(echo))
        .route("/api/boom", get(boom))
        .fallback(fallback);

    // The platform assigns the port; the IPC proxy injects it as `PORT`.
    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    println!("standalone-axum listening on port {port}");
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .unwrap();

    axum::serve(listener, app).await.unwrap();
}
