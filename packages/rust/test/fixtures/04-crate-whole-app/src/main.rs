//! One binary at `src/main.rs` that serves every route, built on the
//! `vercel_runtime` crate.
//!
//! Regression fixture. Because this crate depends on `vercel_runtime` it speaks
//! the runtime protocol itself, so it must keep the original single-binary
//! output and must NOT be switched to standalone mode. The framework preset
//! supplies the catch-all route that sends every request here.

use axum::{
    http::{header, StatusCode, Uri},
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use tower::ServiceBuilder;
use vercel_runtime::{axum::VercelLayer, Error};

const RANDOMNESS: &str = "RANDOMNESS_PLACEHOLDER";

async fn root() -> impl IntoResponse {
    Html(format!(
        "<html><body>framework:vercel_runtime-axum randomness:{RANDOMNESS}</body></html>"
    ))
}

async fn item() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/json")],
        format!("{{\"crate\":\"vercel_runtime\",\"randomness\":\"{RANDOMNESS}\"}}"),
    )
}

async fn fallback(uri: Uri) -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        format!("not found:vercel_runtime {}", uri.path()),
    )
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    let router = Router::new()
        .route("/", get(root))
        .route("/api/data", get(item))
        .fallback(fallback);
    let app = ServiceBuilder::new()
        .layer(VercelLayer::new())
        .service(router);

    vercel_runtime::run(app).await
}
