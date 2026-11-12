//! `api/**` serverless handler built on the `vercel_runtime` crate.
//!
//! Regression fixture for the shape used by the published `rust/axum` example:
//! a single `[[bin]]` under `api/`, plus a catch-all rewrite. An `api/` build is
//! never standalone, so this must keep the original single-binary output.

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
        "<html><body>handler:api-axum randomness:{RANDOMNESS}</body></html>"
    ))
}

async fn data() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/json")],
        format!("{{\"handler\":\"api-axum\",\"randomness\":\"{RANDOMNESS}\"}}"),
    )
}

async fn fallback(uri: Uri) -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        format!("not found:api-axum {}", uri.path()),
    )
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    let router = Router::new()
        .route("/", get(root))
        .route("/data", get(data))
        .fallback(fallback);
    let app = ServiceBuilder::new()
        .layer(VercelLayer::new())
        .service(router);

    vercel_runtime::run(app).await
}
