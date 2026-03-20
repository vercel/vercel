use hyper::server::conn::http1;
use hyper::service::service_fn as hyper_service_fn;
use hyper_util::rt::TokioIo;
use std::convert::Infallible;
use std::future::Future;
use std::net::SocketAddr;
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::net::TcpListener;
use tower::Service;

pub use hyper::Response;
pub use types::{Error, ResponseBody};
pub type Request = hyper::Request<hyper::body::Incoming>;

#[cfg(feature = "axum")]
pub mod axum;

#[cfg(unix)]
mod ipc;
#[cfg(unix)]
mod ipc_utils;
mod types;

use crate::types::IntoFunctionResponse;

#[cfg(unix)]
use {
    crate::ipc::core::{EndMessage, StartMessage},
    crate::ipc::log::{Level, LogMessage},
    crate::ipc_utils::{IPC_READY, enqueue_or_send_message, flush_init_log_buffer, send_message},
    std::env,
    std::os::unix::net::UnixStream,
    std::sync::atomic::Ordering,
    std::sync::{Arc, Mutex},
};

#[cfg(unix)]
#[derive(Clone)]
pub struct LogContext {
    ipc_stream: Option<Arc<Mutex<UnixStream>>>,
    invocation_id: Option<String>,
    request_id: Option<u64>,
}

#[cfg(unix)]
impl LogContext {
    pub fn new(
        ipc_stream: Option<Arc<Mutex<UnixStream>>>,
        invocation_id: Option<String>,
        request_id: Option<u64>,
    ) -> Self {
        Self {
            ipc_stream,
            invocation_id,
            request_id,
        }
    }

    pub fn info(&self, msg: &str) {
        self.log(Level::Info, msg);
    }

    pub fn error(&self, msg: &str) {
        self.log(Level::Error, msg);
    }

    pub fn warn(&self, msg: &str) {
        self.log(Level::Warn, msg);
    }

    pub fn debug(&self, msg: &str) {
        self.log(Level::Debug, msg);
    }

    fn log(&self, level: Level, msg: &str) {
        if let (Some(inv_id), Some(req_id)) = (&self.invocation_id, &self.request_id) {
            let log = LogMessage::with_level(inv_id.clone(), *req_id, msg, level);
            if let Err(_e) = enqueue_or_send_message(&self.ipc_stream, log) {
                // Failed to send or queue log message
            }
        } else {
            // Fall back to regular println when no request context
            println!("{:?}: {}", level, msg);
        }
    }
}

// Non-Unix version without IPC support (simple logging to stdout)
#[cfg(not(unix))]
#[derive(Clone)]
pub struct LogContext {
    _placeholder: (),
}

#[cfg(not(unix))]
impl LogContext {
    pub fn new() -> Self {
        Self { _placeholder: () }
    }

    pub fn info(&self, msg: &str) {
        println!("INFO: {}", msg);
    }

    pub fn error(&self, msg: &str) {
        eprintln!("ERROR: {}", msg);
    }

    pub fn warn(&self, msg: &str) {
        println!("WARN: {}", msg);
    }

    pub fn debug(&self, msg: &str) {
        println!("DEBUG: {}", msg);
    }
}

#[cfg(not(unix))]
impl Default for LogContext {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone)]
pub struct AppState {
    pub log_context: LogContext,
}

impl AppState {
    pub fn new(log_context: LogContext) -> Self {
        Self { log_context }
    }
}

/// Trait that abstracts over handler function signatures that return types implementing IntoFunctionResponse
pub trait Handler {
    type Output: IntoFunctionResponse;
    type Future: Future<Output = Self::Output> + Send + 'static;
    fn call(&self, req: Request, state: AppState) -> Self::Future;
}

/// Implementation for handlers that return IntoFunctionResponse types
impl<F, Fut, R> Handler for F
where
    F: Fn(Request, AppState) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = R> + Send + 'static,
    R: IntoFunctionResponse,
{
    type Output = R;
    type Future = Fut;

    fn call(&self, req: Request, state: AppState) -> Self::Future {
        self(req, state)
    }
}

/// Wrapper for stateless handlers that return IntoFunctionResponse types
#[derive(Clone)]
pub struct StatelessHandler<F> {
    f: F,
}

impl<F, Fut, R> Handler for StatelessHandler<F>
where
    F: Fn(Request) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = R> + Send + 'static,
    R: IntoFunctionResponse,
{
    type Output = R;
    type Future = Fut;

    fn call(&self, req: Request, _state: AppState) -> Self::Future {
        (self.f)(req)
    }
}

/// Service function creation trait for different handler signatures
pub trait IntoServiceFn<Args> {
    type Handler: Handler;
    fn into_service_fn(self) -> ServiceFn<Self::Handler>;
}

/// Implementation for handlers that take Request and AppState
impl<F, Fut, R> IntoServiceFn<(Request, AppState)> for F
where
    F: Fn(Request, AppState) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = R> + Send + 'static,
    R: IntoFunctionResponse,
{
    type Handler = F;

    fn into_service_fn(self) -> ServiceFn<Self::Handler> {
        ServiceFn { f: self }
    }
}

/// Implementation for handlers that only take Request (stateless)
impl<F, Fut, R> IntoServiceFn<(Request,)> for F
where
    F: Fn(Request) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = R> + Send + 'static,
    R: IntoFunctionResponse,
{
    type Handler = StatelessHandler<F>;

    fn into_service_fn(self) -> ServiceFn<Self::Handler> {
        ServiceFn {
            f: StatelessHandler { f: self },
        }
    }
}

/// Creates a Tower service from a handler function
pub fn service_fn<F, Args>(handler: F) -> ServiceFn<F::Handler>
where
    F: IntoServiceFn<Args>,
{
    handler.into_service_fn()
}

/// A Tower service wrapper around a handler function
#[derive(Clone)]
pub struct ServiceFn<H> {
    f: H,
}

impl<H> Service<(AppState, Request)> for ServiceFn<H>
where
    H: Handler + Clone + Send + 'static,
    H::Future: Send + 'static,
    H::Output: Send + 'static,
{
    type Response = Response<ResponseBody>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, _cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, (state, req): (AppState, Request)) -> Self::Future {
        let f = self.f.clone();
        Box::pin(async move {
            let result = f.call(req, state).await;
            result.into_response()
        })
    }
}

/// Run a Tower service with Vercel's runtime
pub async fn run<S>(service: S) -> Result<(), Error>
where
    S: tower::Service<
            (AppState, hyper::Request<hyper::body::Incoming>),
            Response = Response<ResponseBody>,
            Error = Error,
        > + Send
        + Clone
        + 'static,
    S::Future: Send + 'static,
{
    // IPC stream setup
    #[cfg(unix)]
    let ipc_stream = match env::var("VERCEL_IPC_PATH") {
        Ok(ipc_path) => match UnixStream::connect(ipc_path) {
            Ok(stream) => Some(Arc::new(Mutex::new(stream))),
            Err(_) => None,
        },
        Err(_) => None,
    };

    let port = 3000;
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = TcpListener::bind(addr).await?;

    // Send start message via IPC
    #[cfg(unix)]
    {
        if let Some(ref ipc_stream_ref) = ipc_stream {
            let start_message = StartMessage::new(0, port);
            if let Err(_e) = send_message(ipc_stream_ref, start_message) {
                // Failed to send start message to IPC
            } else {
                IPC_READY.store(true, Ordering::Relaxed);
                flush_init_log_buffer(&ipc_stream);
            }
        } else {
            println!("Dev server listening: {}", port);
            flush_init_log_buffer(&ipc_stream);
        }
    }

    #[cfg(not(unix))]
    {
        println!("Dev server listening: {}", port);
    }

    loop {
        let (stream, _) = listener.accept().await?;
        let io = TokioIo::new(stream);
        #[cfg(unix)]
        let ipc_stream_clone = ipc_stream.clone();
        let service_clone = service.clone();

        tokio::task::spawn(async move {
            if let Err(_e) = http1::Builder::new()
                .keep_alive(true)
                .half_close(true)
                .serve_connection(
                    io,
                    hyper_service_fn(move |req| {
                        let mut service_clone = service_clone.clone();

                        // Extract information for IPC before calling handler (Unix only)
                        #[cfg(unix)]
                        let (app_state, invocation_id, request_id) = {
                            let ipc_stream_clone = ipc_stream_clone.clone();
                            let invocation_id = req
                                .headers()
                                .get("x-vercel-internal-invocation-id")
                                .and_then(|v| v.to_str().ok())
                                .map(|s| s.to_owned());
                            let request_id = req
                                .headers()
                                .get("x-vercel-internal-request-id")
                                .and_then(|v| v.to_str().ok())
                                .and_then(|s| s.parse::<u64>().ok());
                            let app_state = AppState::new(LogContext::new(
                                ipc_stream_clone,
                                invocation_id.clone(),
                                request_id,
                            ));
                            (app_state, invocation_id, request_id)
                        };

                        #[cfg(not(unix))]
                        let app_state = AppState::new(LogContext::new());

                        async move {
                            #[cfg(unix)]
                            let ipc_stream_for_end = app_state.log_context.ipc_stream.clone();

                            if req.uri().path() == "/_vercel/ping" {
                                let response = hyper::Response::builder()
                                    .status(200)
                                    .body(ResponseBody::from("OK"))
                                    .unwrap();
                                return Ok::<_, Infallible>(response);
                            }

                            let response = match tower::ServiceExt::ready(&mut service_clone).await
                            {
                                Ok(ready_service) => {
                                    match tower::Service::call(ready_service, (app_state, req))
                                        .await
                                    {
                                        Ok(resp) => resp,
                                        Err(_e) => {
                                            // Service error
                                            hyper::Response::builder()
                                                .status(500)
                                                .header("connection", "close")
                                                .body(ResponseBody::from("Internal Server Error"))
                                                .unwrap()
                                        }
                                    }
                                }
                                Err(_e) => {
                                    // Service not ready
                                    hyper::Response::builder()
                                        .status(500)
                                        .header("connection", "close")
                                        .body(ResponseBody::from("Service Not Ready"))
                                        .unwrap()
                                }
                            };

                            // Send end message via IPC
                            #[cfg(unix)]
                            if let (Some(ipc_stream), Some(inv_id), Some(req_id)) =
                                (&ipc_stream_for_end, &invocation_id, &request_id)
                            {
                                let end_message = EndMessage::new(inv_id.clone(), *req_id, None);
                                if let Err(_e) = send_message(ipc_stream, end_message) {
                                    // Failed to send end message
                                }
                            }

                            Ok::<_, Infallible>(response)
                        }
                    }),
                )
                .await
            {
                // Error serving connection
            }
        });
    }
}
