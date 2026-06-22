use vercel_runtime::{run, service_fn, Error, Request, Response, ResponseBody};

// Internal rust service. Only reachable through a service binding. The dev
// server (vercel_runtime::run) binds the orchestrator-assigned VERCEL_DEV_PORT.
async fn handler(_req: Request) -> Result<Response<ResponseBody>, Error> {
    Ok(Response::builder()
        .status(200)
        .body(ResponseBody::from("rust_api: ok"))?)
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    run(service_fn(handler)).await
}
