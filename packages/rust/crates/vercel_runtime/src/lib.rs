use serde::{Deserialize, Serialize};
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
use hyper::service::service_fn;
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;

#[derive(Serialize, Deserialize, Debug)]
pub struct RequestContext {
    #[serde(rename = "invocationId")]
    pub invocation_id: String,
    #[serde(rename = "requestId")]
    pub request_id: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StartMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    pub payload: StartPayload,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StartPayload {
    #[serde(rename = "initDuration")]
    pub init_duration: u64,
    #[serde(rename = "httpPort")]
    pub http_port: u16,
}

impl StartMessage {
    pub fn new(init_duration: u64, http_port: u16) -> Self {
        Self {
            message_type: "server-started".to_string(),
            payload: StartPayload {
                init_duration,
                http_port,
            },
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct EndMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    pub payload: EndPayload,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct EndPayload {
    pub context: RequestContext,
    pub error: Option<serde_json::Value>,
}

impl EndMessage {
    pub fn new(invocation_id: String, request_id: u64, error: Option<serde_json::Value>) -> Self {
        Self {
            message_type: "end".to_string(),
            payload: EndPayload {
                context: RequestContext {
                    invocation_id,
                    request_id,
                },
                error,
            },
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MetricMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    pub payload: MetricPayload,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MetricPayload {
    pub context: RequestContext,
    #[serde(rename = "type")]
    pub metric_type: Option<String>,
    #[serde(rename = "payload")]
    pub metric_payload: Option<serde_json::Value>,
}

impl MetricMessage {
    pub fn new(
        invocation_id: String,
        request_id: u64,
        metric_type: Option<String>,
        metric_payload: Option<serde_json::Value>,
    ) -> Self {
        Self {
            message_type: "metric".to_string(),
            payload: MetricPayload {
                context: RequestContext {
                    invocation_id,
                    request_id,
                },
                metric_type,
                metric_payload,
            },
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Stream {
    Stdout,
    Stderr,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
pub enum LogType {
    Stream { stream: Stream },
    Level { level: Level },
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LogPayload {
    pub context: RequestContext,
    pub message: String,
    #[serde(flatten)]
    pub log_type: LogType,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LogMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    pub payload: LogPayload,
}

impl LogMessage {
    pub fn stream(invocation_id: String, request_id: u64, message: String, stream: Stream) -> Self {
        Self {
            message_type: "log".to_string(),
            payload: LogPayload {
                context: RequestContext {
                    invocation_id,
                    request_id,
                },
                message,
                log_type: LogType::Stream { stream },
            },
        }
    }

    pub fn level(invocation_id: String, request_id: u64, message: String, level: Level) -> Self {
        Self {
            message_type: "log".to_string(),
            payload: LogPayload {
                context: RequestContext {
                    invocation_id,
                    request_id,
                },
                message,
                log_type: LogType::Level { level },
            },
        }
    }

    pub fn encode_message(message: &str) -> String {
        use base64::Engine;
        use base64::engine::general_purpose::STANDARD as BASE64_ENCODER;
        BASE64_ENCODER.encode(message)
    }

    pub fn with_stream(
        invocation_id: String,
        request_id: u64,
        message: &str,
        stream: Stream,
    ) -> Self {
        Self::stream(
            invocation_id,
            request_id,
            Self::encode_message(message),
            stream,
        )
    }

    pub fn with_level(invocation_id: String, request_id: u64, message: &str, level: Level) -> Self {
        Self::level(
            invocation_id,
            request_id,
            Self::encode_message(message),
            level,
        )
    }
}

pub type ResponseBody = http_body_util::combinators::BoxBody<Bytes, Error>;
pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub use hyper::Response;
pub type Request = hyper::Request<hyper::body::Incoming>;
pub struct ResponseBuilder;

impl ResponseBuilder {
    #[allow(clippy::new_ret_no_self)]
    pub fn new() -> hyper::http::response::Builder {
        hyper::Response::builder()
    }
}

/// Trait for automatic body conversion to ResponseBody
pub trait IntoResponseBody {
    fn into_response_body(self) -> ResponseBody;
}

impl IntoResponseBody for &str {
    fn into_response_body(self) -> ResponseBody {
        http_body_util::Full::new(Bytes::from(self.to_string()))
            .map_err(|e| Box::new(e) as Error)
            .boxed()
    }
}

impl IntoResponseBody for String {
    fn into_response_body(self) -> ResponseBody {
        http_body_util::Full::new(Bytes::from(self))
            .map_err(|e| Box::new(e) as Error)
            .boxed()
    }
}

impl IntoResponseBody for Bytes {
    fn into_response_body(self) -> ResponseBody {
        http_body_util::Full::new(self)
            .map_err(|e| Box::new(e) as Error)
            .boxed()
    }
}

impl IntoResponseBody for http_body_util::Full<Bytes> {
    fn into_response_body(self) -> ResponseBody {
        self.map_err(|e| Box::new(e) as Error).boxed()
    }
}

impl<T> IntoResponseBody for http_body_util::StreamBody<T>
where
    T: tokio_stream::Stream<Item = Result<hyper::body::Frame<Bytes>, Error>>
        + Send
        + Sync
        + 'static,
{
    fn into_response_body(self) -> ResponseBody {
        self.boxed()
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
        if let (Some(ipc_stream), Some(inv_id), Some(req_id)) =
            (&self.ipc_stream, &self.invocation_id, &self.request_id)
        {
            let log = LogMessage::with_level(inv_id.clone(), *req_id, msg, level);
            send_message(ipc_stream, log).unwrap_or_else(|e| {
                eprintln!("Failed to send log message: {}", e);
            });
        } else {
            // Fall back to regular println when IPC is not available
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

pub fn send_message<T: Serialize>(
    stream: &Arc<Mutex<UnixStream>>,
    message: T,
) -> Result<(), Error> {
    let mut stream = stream.lock().unwrap();
    let json_str = serde_json::to_string(&message)?;
    let msg = format!("{json_str}\0");
    stream.write_all(msg.as_bytes())?;
    Ok(())
}

pub async fn run<H, F>(handler: H) -> Result<(), Error>
where
    H: Fn(AppState, hyper::Request<hyper::body::Incoming>) -> F + Send + Sync + 'static + Copy,
    F: Future<Output = Result<Response<ResponseBody>, Error>> + Send + 'static,
{
    let ipc_stream = match env::var("VERCEL_IPC_PATH") {
        Ok(ipc_path) => match UnixStream::connect(ipc_path) {
            Ok(stream) => Some(Arc::new(Mutex::new(stream))),
            Err(e) => {
                eprintln!(
                    "Warning: Failed to connect to IPC stream: {}. Running without IPC support.",
                    e
                );
                None
            }
        },
        Err(_) => {
            // No IPC available (dev mode like Bun)
            None
        }
    };

    let port = 3000;
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = TcpListener::bind(addr).await?;

    // Send IPC start message
    if let Some(ref ipc_stream) = ipc_stream {
        let start_message = StartMessage::new(0, port);
        send_message(ipc_stream, start_message)?;
    } else {
        // If we couldn't find an IPC stream, we are in `vercel dev` mode,
        // Print to stdout for dev server to parse (see ./start-dev-server.ts)
        println!("Dev server listening: {}", port);
    };

    loop {
        let (stream, _) = listener.accept().await?;

        let io = TokioIo::new(stream);
        let ipc_stream_clone = ipc_stream.clone();

        tokio::task::spawn(async move {
            if let Err(err) = http1::Builder::new()
                .serve_connection(
                    io,
                    service_fn(move |req| {
                        let ipc_stream_clone = ipc_stream_clone.clone();

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
                                    .body("OK".into_response_body())
                                    .unwrap();
                                return Ok::<_, Infallible>(response);
                            }

                            let response = match handler(app_state, req).await {
                                Ok(resp) => resp,
                                Err(e) => {
                                    eprintln!("Handler error: {}", e);
                                    let error_body = http_body_util::Full::new(Bytes::from(
                                        "Internal Server Error",
                                    ));
                                    hyper::Response::builder()
                                        .status(500)
                                        .body(error_body.map_err(|e| Box::new(e) as Error).boxed())
                                        .unwrap()
                                }
                            };

                            if let (Some(ipc_stream), Some(inv_id), Some(req_id)) =
                                (&ipc_stream_for_end, &invocation_id, &request_id)
                            {
                                let end_message = EndMessage::new(inv_id.clone(), *req_id, None);
                                send_message(ipc_stream, end_message).unwrap_or_else(|e| {
                                    eprintln!("Failed to send end message: {}", e);
                                });
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
