use serde::Serialize;
use std::convert::Infallible;
use std::env;
use std::future::Future;
use std::io::prelude::*;
use std::net::SocketAddr;
use std::os::unix::net::UnixStream;
use std::sync::{Arc, Mutex};

use http_body_util::BodyExt;
use hyper::body::Bytes;
use hyper::server::conn::http1;
use hyper::service::service_fn as hyper_service_fn;
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;

use base64::prelude::*;
use std::collections::VecDeque;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::task::{Context, Poll};
use tower::Service;

mod ipc;
use ipc::core::{EndMessage, StartMessage};
use ipc::log::{Level, LogMessage};

#[cfg(feature = "axum")]
pub mod axum;

pub use hyper::Response;
pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type Request = hyper::Request<hyper::body::Incoming>;

/// A wrapper around BoxBody that allows implementing From traits
#[derive(Debug)]
pub struct ResponseBody(pub http_body_util::combinators::BoxBody<Bytes, Error>);

impl std::ops::Deref for ResponseBody {
    type Target = http_body_util::combinators::BoxBody<Bytes, Error>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::ops::DerefMut for ResponseBody {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl http_body::Body for ResponseBody {
    type Data = Bytes;
    type Error = Error;

    fn poll_frame(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Result<http_body::Frame<Self::Data>, Self::Error>>> {
        std::pin::Pin::new(&mut self.0).poll_frame(cx)
    }

    fn is_end_stream(&self) -> bool {
        self.0.is_end_stream()
    }

    fn size_hint(&self) -> http_body::SizeHint {
        self.0.size_hint()
    }
}

impl From<&str> for ResponseBody {
    fn from(value: &str) -> Self {
        let body = http_body_util::Full::new(Bytes::from(value.to_string()))
            .map_err(|e| Box::new(e) as Error);
        ResponseBody(body.boxed())
    }
}

impl From<String> for ResponseBody {
    fn from(value: String) -> Self {
        let bytes = Bytes::from(value);
        let body = http_body_util::Full::new(bytes).map_err(|e| Box::new(e) as Error);
        ResponseBody(body.boxed())
    }
}

impl From<Bytes> for ResponseBody {
    fn from(value: Bytes) -> Self {
        let body = http_body_util::Full::new(value).map_err(|e| Box::new(e) as Error);
        ResponseBody(body.boxed())
    }
}

impl From<http_body_util::Full<Bytes>> for ResponseBody {
    fn from(value: http_body_util::Full<Bytes>) -> Self {
        let body = value.map_err(|e| Box::new(e) as Error);
        ResponseBody(body.boxed())
    }
}

impl<T> From<http_body_util::StreamBody<T>> for ResponseBody
where
    T: tokio_stream::Stream<Item = Result<hyper::body::Frame<Bytes>, Error>>
        + Send
        + Sync
        + 'static,
{
    fn from(value: http_body_util::StreamBody<T>) -> Self {
        ResponseBody(value.boxed())
    }
}

static IPC_READY: AtomicBool = AtomicBool::new(false);
static INIT_LOG_BUF_MAX_BYTES: usize = 1_000_000;

lazy_static::lazy_static! {
    static ref INIT_LOG_BUFFER: Arc<Mutex<(VecDeque<String>, usize)>> = {
        register_exit_handler();
        Arc::new(Mutex::new((VecDeque::new(), 0)))
    };
}

// Register exit handler to flush buffered messages
fn register_exit_handler() {
    extern "C" fn exit_handler() {
        flush_init_log_buf_to_stderr();
    }
    unsafe {
        libc::atexit(exit_handler);
    }
}

#[derive(Clone)]
pub struct LogContext {
    ipc_stream: Option<Arc<Mutex<UnixStream>>>,
    invocation_id: Option<String>,
    request_id: Option<u64>,
}

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
            if let Err(e) = enqueue_or_send_message(&self.ipc_stream, log) {
                eprintln!("Failed to send/queue log message: {}", e);
            }
        } else {
            // Fall back to regular println when no request context
            println!("{:?}: {}", level, msg);
        }
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

fn send_message<T: Serialize>(stream: &Arc<Mutex<UnixStream>>, message: T) -> Result<(), Error> {
    let json_str = serde_json::to_string(&message)?;
    let msg = format!("{json_str}\0");

    let mut stream = stream.lock().map_err(|e| {
        Box::new(std::io::Error::other(format!(
            "Failed to acquire stream lock: {}",
            e
        ))) as Error
    })?;

    stream.write_all(msg.as_bytes())?;
    stream.flush()?;
    Ok(())
}

fn enqueue_or_send_message<T: Serialize>(
    stream: &Option<Arc<Mutex<UnixStream>>>,
    message: T,
) -> Result<(), Error> {
    if IPC_READY.load(Ordering::Relaxed)
        && let Some(stream) = stream
    {
        return send_message(stream, message);
    }

    // Buffer the message if IPC is not ready
    let json_str = serde_json::to_string(&message)?;
    let msg_len = json_str.len();

    if let Ok(mut buffer) = INIT_LOG_BUFFER.lock() {
        if buffer.1 + msg_len <= INIT_LOG_BUF_MAX_BYTES {
            buffer.0.push_back(json_str);
            buffer.1 += msg_len;
        } else {
            // Fallback to stderr if buffer is full - decode base64
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str)
                && let Some(payload) = parsed.get("payload")
                && let Some(msg) = payload.get("message")
                && let Some(msg_str) = msg.as_str()
                && let Ok(decoded) = BASE64_STANDARD.decode(msg_str)
                && let Ok(text) = String::from_utf8(decoded)
            {
                eprint!("{}", text);
            }
        }
    }

    Ok(())
}

fn flush_init_log_buffer(stream: &Option<Arc<Mutex<UnixStream>>>) {
    if let Some(stream) = stream {
        if let Ok(mut buffer) = INIT_LOG_BUFFER.lock() {
            while let Some(json_str) = buffer.0.pop_front() {
                if let Ok(message) = serde_json::from_str::<serde_json::Value>(&json_str)
                    && let Err(_e) = send_message(stream, message)
                {
                    // Failed to send buffered message
                    break;
                }
            }
            buffer.1 = 0; // Reset byte count
        }
    } else {
        flush_init_log_buf_to_stderr();
    }
}

fn flush_init_log_buf_to_stderr() {
    if let Ok(mut buffer) = INIT_LOG_BUFFER.lock() {
        let mut combined: Vec<String> = Vec::new();

        while let Some(json_str) = buffer.0.pop_front() {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str)
                && let Some(payload) = parsed.get("payload")
                && let Some(msg) = payload.get("message")
                && let Some(msg_str) = msg.as_str()
                && let Ok(decoded) = BASE64_STANDARD.decode(msg_str)
                && let Ok(text) = String::from_utf8(decoded)
            {
                combined.push(text);
            }
        }

        if !combined.is_empty() {
            eprint!("{}", combined.join(""));
        }

        buffer.1 = 0;
    }
}

/// Trait that abstracts over handler function signatures
pub trait Handler {
    type Future: Future<Output = Result<Response<ResponseBody>, Error>> + Send + 'static;
    fn call(&self, req: Request, state: AppState) -> Self::Future;
}

/// Implementation for handlers that take both Request and AppState
impl<F, Fut> Handler for F
where
    F: Fn(Request, AppState) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = Result<Response<ResponseBody>, Error>> + Send + 'static,
{
    type Future = Fut;

    fn call(&self, req: Request, state: AppState) -> Self::Future {
        self(req, state)
    }
}

/// Wrapper for stateless handlers that only take Request
#[derive(Clone)]
pub struct StatelessHandler<F> {
    f: F,
}

impl<F, Fut> Handler for StatelessHandler<F>
where
    F: Fn(Request) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = Result<Response<ResponseBody>, Error>> + Send + 'static,
{
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

/// Implementation for handlers that take Request and AppState (new signature)
impl<F, Fut> IntoServiceFn<(Request, AppState)> for F
where
    F: Fn(Request, AppState) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = Result<Response<ResponseBody>, Error>> + Send + 'static,
{
    type Handler = F;

    fn into_service_fn(self) -> ServiceFn<Self::Handler> {
        ServiceFn { f: self }
    }
}

/// Implementation for handlers that only take Request (stateless)
impl<F, Fut> IntoServiceFn<(Request,)> for F
where
    F: Fn(Request) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = Result<Response<ResponseBody>, Error>> + Send + 'static,
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
{
    type Response = Response<ResponseBody>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, _cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, (state, req): (AppState, Request)) -> Self::Future {
        let f = self.f.clone();
        Box::pin(async move { f.call(req, state).await })
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

    if let Some(ref ipc_stream_ref) = ipc_stream {
        let start_message = StartMessage::new(0, port);
        if let Err(e) = send_message(ipc_stream_ref, start_message) {
            eprintln!(
                "Warning: Failed to send start message to IPC: {}. Continuing without IPC support.",
                e
            );
        } else {
            IPC_READY.store(true, Ordering::Relaxed);
            flush_init_log_buffer(&ipc_stream);
        }
    } else {
        println!("Dev server listening: {}", port);
        flush_init_log_buffer(&ipc_stream);
    };

    loop {
        let (stream, _) = listener.accept().await?;
        let io = TokioIo::new(stream);
        let ipc_stream_clone = ipc_stream.clone();
        let service_clone = service.clone();

        tokio::task::spawn(async move {
            if let Err(err) = http1::Builder::new()
                .keep_alive(true)
                .half_close(true)
                .serve_connection(
                    io,
                    hyper_service_fn(move |req| {
                        let ipc_stream_clone = ipc_stream_clone.clone();
                        let mut service_clone = service_clone.clone();

                        // Extract information for IPC before calling handler
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

                        async move {
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
                eprintln!("Error serving connection: {:?}", err);
            }
        });
    }
}
