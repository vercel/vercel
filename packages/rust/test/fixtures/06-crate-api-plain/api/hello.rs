//! A plain `api/**` serverless function: `vercel_runtime` with no HTTP
//! framework and no crate features.
//!
//! Regression fixture for the oldest and simplest way to write Rust on Vercel.
//! An `api/` build is never switched to standalone mode, so this keeps the
//! original single-binary output and is routed by filename to `/api/hello`.

use vercel_runtime::{run, service_fn, Error, Request, Response};

const RANDOMNESS: &str = "RANDOMNESS_PLACEHOLDER";

async fn handler(req: Request) -> Result<Response<String>, Error> {
    let query = req.uri().query().unwrap_or("");

    Ok(Response::builder()
        .status(200)
        .header("content-type", "text/plain; charset=utf-8")
        .body(format!(
            "handler:api-plain randomness:{RANDOMNESS} method:{} query:{query}",
            req.method()
        ))?)
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    run(service_fn(handler)).await
}
