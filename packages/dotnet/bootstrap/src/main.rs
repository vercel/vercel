use std::{
    convert::Infallible,
    env,
    error::Error,
    net::TcpListener as StdTcpListener,
    path::Path,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::{Duration, Instant},
};

use http_body_util::{combinators::BoxBody, BodyExt, Full};
use hyper::{
    body::{Body, Bytes, Frame, Incoming},
    header::HOST,
    server::conn::http1,
    service::service_fn,
    Request, Response, StatusCode, Uri,
};
use hyper_util::{
    client::legacy::{connect::HttpConnector, Client},
    rt::{TokioExecutor, TokioIo},
};
use serde::Serialize;
use tokio::{
    io::AsyncWriteExt,
    net::{TcpListener, UnixStream},
    process::Command,
    sync::Mutex,
    time::sleep,
};

type BoxError = Box<dyn Error + Send + Sync>;
type ProxiedBoxBody = BoxBody<Bytes, hyper::Error>;
type ProxiedResponse = Response<ProxyBody<ProxiedBoxBody>>;

#[derive(Serialize)]
struct StartMessage {
    #[serde(rename = "type")]
    type_name: &'static str,
    payload: StartPayload,
}

#[derive(Serialize)]
struct StartPayload {
    #[serde(rename = "initDuration")]
    init_duration: i64,
    #[serde(rename = "httpPort")]
    http_port: u16,
}

#[derive(Serialize)]
struct EndMessage {
    #[serde(rename = "type")]
    type_name: &'static str,
    payload: EndPayload,
}

#[derive(Serialize)]
struct EndPayload {
    context: RequestContext,
    error: Option<String>,
}

#[derive(Serialize)]
struct RequestContext {
    #[serde(rename = "invocationId")]
    invocation_id: String,
    #[serde(rename = "requestId")]
    request_id: u64,
}

#[derive(Clone)]
struct State {
    client: Client<HttpConnector, Incoming>,
    ipc: Option<Arc<Mutex<UnixStream>>>,
    service_route_prefix: String,
    user_port: u16,
}

#[derive(Clone)]
struct CompletionContext {
    ipc: Option<Arc<Mutex<UnixStream>>>,
    invocation_id: Option<String>,
    request_id: u64,
}

impl CompletionContext {
    fn notify_end(self, error: Option<String>) {
        let Some(ipc) = self.ipc else {
            return;
        };
        let Some(invocation_id) = self.invocation_id else {
            return;
        };

        tokio::spawn(async move {
            let end_message = EndMessage {
                type_name: "end",
                payload: EndPayload {
                    context: RequestContext {
                        invocation_id,
                        request_id: self.request_id,
                    },
                    error,
                },
            };

            if let Err(err) = send_ipc_message(&Some(ipc), &end_message).await {
                eprintln!("Warning: Failed to send IPC end message: {err}");
            }
        });
    }
}

struct ProxyBody<B> {
    inner: B,
    completion: Option<CompletionContext>,
    error_message: Option<String>,
}

impl<B> ProxyBody<B> {
    fn new(inner: B, completion: Option<CompletionContext>) -> Self {
        Self {
            inner,
            completion,
            error_message: None,
        }
    }

    fn notify_end(&mut self) {
        if let Some(completion) = self.completion.take() {
            completion.notify_end(self.error_message.take());
        }
    }
}

impl<B> Drop for ProxyBody<B> {
    fn drop(&mut self) {
        self.notify_end();
    }
}

impl<B> Body for ProxyBody<B>
where
    B: Body<Data = Bytes, Error = hyper::Error> + Unpin,
{
    type Data = Bytes;
    type Error = hyper::Error;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
        match Pin::new(&mut self.inner).poll_frame(cx) {
            Poll::Ready(None) => {
                self.notify_end();
                Poll::Ready(None)
            }
            Poll::Ready(Some(Err(err))) => {
                self.error_message = Some(err.to_string());
                self.notify_end();
                Poll::Ready(Some(Err(err)))
            }
            other => other,
        }
    }

    fn is_end_stream(&self) -> bool {
        self.inner.is_end_stream()
    }

    fn size_hint(&self) -> hyper::body::SizeHint {
        self.inner.size_hint()
    }
}

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    let start_time = Instant::now();
    let service_route_prefix = resolve_service_route_prefix();

    let ipc = match connect_ipc().await {
        Ok(ipc) => ipc,
        Err(err) => {
            eprintln!("Warning: {err}");
            None
        }
    };

    let user_port = find_free_port()?;
    let user_binary = "./user-server";
    if !Path::new(user_binary).exists() {
        eprintln!("User server binary not found: {user_binary}");
        std::process::exit(1);
    }

    let mut child = Command::new(user_binary)
        .kill_on_drop(true)
        .env("PORT", user_port.to_string())
        .env("ASPNETCORE_URLS", format!("http://0.0.0.0:{user_port}"))
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit())
        .spawn()?;

    if let Err(err) = wait_for_server(user_port, Duration::from_secs(30)).await {
        eprintln!("User server failed to start: {err}");
        let _ = child.kill().await;
        std::process::exit(1);
    }

    let listen_port = 3000;
    let listener = TcpListener::bind(("127.0.0.1", listen_port)).await?;
    let connector = HttpConnector::new();
    let client: Client<HttpConnector, Incoming> =
        Client::builder(TokioExecutor::new()).build(connector);
    let state = State {
        client,
        ipc: ipc.clone(),
        service_route_prefix,
        user_port,
    };

    let init_duration = start_time.elapsed().as_millis() as i64;
    let start_message = StartMessage {
        type_name: "server-started",
        payload: StartPayload {
            init_duration,
            http_port: listen_port,
        },
    };

    if let Err(err) = send_ipc_message(&ipc, &start_message).await {
        eprintln!("Warning: Failed to send IPC start message: {err}");
    } else if ipc.is_none() {
        println!(
            "Server listening on port {listen_port} (proxying to user server on port {user_port})"
        );
    }

    loop {
        tokio::select! {
            accepted = listener.accept() => {
                let (stream, _) = accepted?;
                let io = TokioIo::new(stream);
                let request_state = state.clone();

                tokio::spawn(async move {
                    let service = service_fn(move |request| handle_request(request, request_state.clone()));
                    if let Err(err) = http1::Builder::new().serve_connection(io, service).await {
                        eprintln!("Connection error: {err}");
                    }
                });
            }
            exited = child.wait() => {
                match exited {
                    Ok(status) => {
                        return Err(format!("User server exited unexpectedly with status {status}").into());
                    }
                    Err(err) => {
                        return Err(format!("Failed while waiting for user server: {err}").into());
                    }
                }
            }
        }
    }
}

async fn handle_request(
    request: Request<Incoming>,
    state: State,
) -> Result<ProxiedResponse, Infallible> {
    if request.uri().path() == "/_vercel/ping" {
        return Ok(simple_response(StatusCode::OK, "OK", None));
    }

    let completion = CompletionContext {
        ipc: state.ipc.clone(),
        invocation_id: request
            .headers()
            .get("x-vercel-internal-invocation-id")
            .and_then(|value| value.to_str().ok())
            .map(ToOwned::to_owned),
        request_id: request
            .headers()
            .get("x-vercel-internal-request-id")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or_default(),
    };

    let forwarded_host = request.headers().get("x-forwarded-host").cloned();
    let path = strip_service_route_prefix(request.uri().path(), &state.service_route_prefix);
    let query = request.uri().query().map(ToOwned::to_owned);

    let target_uri = match build_target_uri(state.user_port, &path, query.as_deref()) {
        Ok(uri) => uri,
        Err(err) => {
            return Ok(simple_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Invalid proxy URI: {err}"),
                Some(completion),
            ));
        }
    };

    let mut proxied_request = request;
    *proxied_request.uri_mut() = target_uri;

    let internal_headers: Vec<_> = proxied_request
        .headers()
        .keys()
        .filter(|name| name.as_str().starts_with("x-vercel-internal-"))
        .cloned()
        .collect();
    for header_name in internal_headers {
        proxied_request.headers_mut().remove(header_name);
    }

    let target_host = format!("127.0.0.1:{}", state.user_port);
    if let Ok(host) = target_host.parse() {
        proxied_request.headers_mut().insert(HOST, host);
    }
    if let Some(host) = forwarded_host {
        proxied_request.headers_mut().insert(HOST, host);
    }

    match state.client.request(proxied_request).await {
        Ok(response) => Ok(response.map(|body| ProxyBody::new(body.boxed(), Some(completion)))),
        Err(err) => Ok(simple_response(
            StatusCode::BAD_GATEWAY,
            format!("Bad Gateway: {err}"),
            Some(completion),
        )),
    }
}

fn simple_response(
    status: StatusCode,
    body: impl Into<String>,
    completion: Option<CompletionContext>,
) -> ProxiedResponse {
    let body = Full::new(Bytes::from(body.into()))
        .map_err(|never| match never {})
        .boxed();
    let mut response = Response::new(ProxyBody::new(body, completion));
    *response.status_mut() = status;
    response
}

fn build_target_uri(
    port: u16,
    path: &str,
    query: Option<&str>,
) -> Result<Uri, hyper::http::uri::InvalidUri> {
    let mut uri = format!("http://127.0.0.1:{port}{path}");
    if let Some(query) = query {
        uri.push('?');
        uri.push_str(query);
    }
    uri.parse()
}

async fn connect_ipc() -> Result<Option<Arc<Mutex<UnixStream>>>, BoxError> {
    let ipc_path = match env::var("VERCEL_IPC_PATH") {
        Ok(path) if !path.trim().is_empty() => path,
        _ => return Ok(None),
    };

    let stream = UnixStream::connect(ipc_path)
        .await
        .map_err(|err| format!("failed to connect to IPC socket: {err}"))?;
    Ok(Some(Arc::new(Mutex::new(stream))))
}

async fn send_ipc_message<T: Serialize>(
    ipc: &Option<Arc<Mutex<UnixStream>>>,
    message: &T,
) -> Result<(), BoxError> {
    let Some(stream) = ipc else {
        return Ok(());
    };

    let payload = serde_json::to_vec(message)?;
    let mut locked = stream.lock().await;
    locked.write_all(&payload).await?;
    locked.write_all(&[0]).await?;
    Ok(())
}

fn find_free_port() -> Result<u16, BoxError> {
    let listener = StdTcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

async fn wait_for_server(port: u16, timeout: Duration) -> Result<(), BoxError> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .is_ok()
        {
            return Ok(());
        }
        sleep(Duration::from_millis(50)).await;
    }

    Err(format!("server did not start within {timeout:?}").into())
}

fn normalize_service_route_prefix(raw_prefix: &str) -> String {
    if raw_prefix.is_empty() {
        return String::new();
    }

    let mut prefix = raw_prefix.trim().to_string();
    if prefix.is_empty() {
        return String::new();
    }

    if !prefix.starts_with('/') {
        prefix.insert(0, '/');
    }

    if prefix != "/" {
        prefix = prefix.trim_end_matches('/').to_string();
        if prefix.is_empty() {
            prefix = "/".to_string();
        }
    }

    if prefix == "/" {
        return String::new();
    }

    prefix
}

fn service_route_prefix_strip_enabled() -> bool {
    match env::var("VERCEL_SERVICE_ROUTE_PREFIX_STRIP") {
        Ok(value) => {
            let normalized = value.trim().to_ascii_lowercase();
            normalized == "1" || normalized == "true"
        }
        Err(_) => false,
    }
}

fn resolve_service_route_prefix() -> String {
    if !service_route_prefix_strip_enabled() {
        return String::new();
    }

    normalize_service_route_prefix(
        &env::var("VERCEL_SERVICE_ROUTE_PREFIX").unwrap_or_default(),
    )
}

fn strip_service_route_prefix(path_value: &str, prefix: &str) -> String {
    if path_value == "*" {
        return path_value.to_string();
    }

    let mut normalized_path = if path_value.is_empty() {
        "/".to_string()
    } else {
        path_value.to_string()
    };

    if !normalized_path.starts_with('/') {
        normalized_path.insert(0, '/');
    }

    if prefix.is_empty() {
        return normalized_path;
    }

    if normalized_path == prefix {
        return "/".to_string();
    }

    let prefix_with_slash = format!("{prefix}/");
    if normalized_path.starts_with(&prefix_with_slash) {
        let stripped = normalized_path[prefix.len()..].to_string();
        if stripped.is_empty() {
            return "/".to_string();
        }
        return stripped;
    }

    normalized_path
}

#[cfg(test)]
mod tests {
    use super::{normalize_service_route_prefix, strip_service_route_prefix};

    #[test]
    fn strips_matching_service_route_prefix() {
        assert_eq!(strip_service_route_prefix("/svc/api/test", "/svc"), "/api/test");
        assert_eq!(strip_service_route_prefix("/svc", "/svc"), "/");
    }

    #[test]
    fn leaves_non_matching_paths_untouched() {
        assert_eq!(strip_service_route_prefix("/api/test", "/svc"), "/api/test");
    }

    #[test]
    fn normalizes_prefix_input() {
        assert_eq!(normalize_service_route_prefix(" svc/ "), "/svc");
        assert_eq!(normalize_service_route_prefix("/"), "");
    }
}
