use actix_http::body::MessageBody;
use actix_web::dev::{ServiceFactory, ServiceRequest, ServiceResponse};
use actix_web::{App, Error as ActixError};
use hyper::body::{Bytes, Frame};
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tower::{Layer, Service};

use crate::{AppState, Error, Request, ResponseBody};

/// Utility functions for handling streaming responses
pub struct StreamingUtils;

impl StreamingUtils {
    /// Determines if a response should be treated as streaming based on headers
    pub fn is_streaming_response(headers: &actix_web::http::header::HeaderMap) -> bool {
        headers
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .map(|ct| ct.contains("text/event-stream") || ct.contains("application/json"))
            .unwrap_or(false)
    }
}

/// A Tower layer that converts Vercel requests/responses to work with Actix Web
#[derive(Clone)]
pub struct VercelLayer;

impl VercelLayer {
    pub fn new() -> Self {
        Self
    }
}

impl Default for VercelLayer {
    fn default() -> Self {
        Self::new()
    }
}

impl<S> Layer<S> for VercelLayer {
    type Service = VercelService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        VercelService { inner }
    }
}

/// A wrapper that holds an Actix App factory and implements Tower Service
#[derive(Clone)]
pub struct VercelService<S> {
    inner: S,
}

/// Wrapper to make Actix App work with Tower
pub struct ActixAppService<T, B>
where
    T: ServiceFactory<ServiceRequest, Config = (), Response = ServiceResponse<B>, Error = ActixError>
        + 'static,
    B: MessageBody + 'static,
{
    factory: std::sync::Arc<dyn Fn() -> App<T> + Send + Sync>,
    _marker: std::marker::PhantomData<B>,
}

impl<T, B> Clone for ActixAppService<T, B>
where
    T: ServiceFactory<ServiceRequest, Config = (), Response = ServiceResponse<B>, Error = ActixError>
        + 'static,
    B: MessageBody + 'static,
{
    fn clone(&self) -> Self {
        Self {
            factory: self.factory.clone(),
            _marker: std::marker::PhantomData,
        }
    }
}

impl<T, B> ActixAppService<T, B>
where
    T: ServiceFactory<ServiceRequest, Config = (), Response = ServiceResponse<B>, Error = ActixError>
        + 'static,
    B: MessageBody + 'static,
{
    pub fn new<F>(factory: F) -> Self
    where
        F: Fn() -> App<T> + Send + Sync + 'static,
    {
        Self {
            factory: std::sync::Arc::new(factory),
            _marker: std::marker::PhantomData,
        }
    }
}

impl<S> Service<(AppState, Request)> for VercelService<S>
where
    S: ActixHandler + Clone + Send + 'static,
{
    type Response = hyper::Response<ResponseBody>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, _cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, (_state, req): (AppState, Request)) -> Self::Future {
        let handler = self.inner.clone();

        Box::pin(async move { handler.handle(req).await })
    }
}

/// Trait for types that can handle Vercel requests using Actix
pub trait ActixHandler: Clone + Send + Sync + 'static {
    fn handle(
        &self,
        req: Request,
    ) -> Pin<Box<dyn Future<Output = Result<hyper::Response<ResponseBody>, Error>> + Send>>;
}

/// A simpler approach: wrap an async handler function
#[derive(Clone)]
pub struct ActixFnHandler<F> {
    handler: F,
}

impl<F> ActixFnHandler<F> {
    pub fn new(handler: F) -> Self {
        Self { handler }
    }
}

impl<F, Fut> ActixHandler for ActixFnHandler<F>
where
    F: Fn(Request) -> Fut + Clone + Send + Sync + 'static,
    Fut: Future<Output = Result<hyper::Response<ResponseBody>, Error>> + Send + 'static,
{
    fn handle(
        &self,
        req: Request,
    ) -> Pin<Box<dyn Future<Output = Result<hyper::Response<ResponseBody>, Error>> + Send>> {
        let handler = self.handler.clone();
        Box::pin(async move { handler(req).await })
    }
}

/// Create a handler from an async function
pub fn handler_fn<F, Fut>(f: F) -> ActixFnHandler<F>
where
    F: Fn(Request) -> Fut + Clone + Send + Sync + 'static,
    Fut: Future<Output = Result<hyper::Response<ResponseBody>, Error>> + Send + 'static,
{
    ActixFnHandler::new(f)
}

/// Convert a hyper Request to actix_web::HttpRequest components
pub async fn convert_request(
    req: Request,
) -> Result<(actix_web::http::Method, String, Vec<(String, String)>, Bytes), Error> {
    let (parts, body) = req.into_parts();

    let method = match parts.method.as_str() {
        "GET" => actix_web::http::Method::GET,
        "POST" => actix_web::http::Method::POST,
        "PUT" => actix_web::http::Method::PUT,
        "DELETE" => actix_web::http::Method::DELETE,
        "PATCH" => actix_web::http::Method::PATCH,
        "HEAD" => actix_web::http::Method::HEAD,
        "OPTIONS" => actix_web::http::Method::OPTIONS,
        _ => actix_web::http::Method::GET,
    };

    let uri = parts.uri.to_string();

    let headers: Vec<(String, String)> = parts
        .headers
        .iter()
        .filter_map(|(k, v)| {
            v.to_str()
                .ok()
                .map(|val| (k.as_str().to_string(), val.to_string()))
        })
        .collect();

    let body_bytes = http_body_util::BodyExt::collect(body)
        .await
        .map_err(|e| Box::new(e) as Error)?
        .to_bytes();

    Ok((method, uri, headers, body_bytes))
}

/// Convert an actix_web response to a hyper Response
pub fn convert_response<B>(
    actix_response: actix_web::HttpResponse<B>,
) -> Result<hyper::Response<ResponseBody>, Error>
where
    B: MessageBody + Unpin,
    B::Error: std::fmt::Debug,
{
    let status = actix_response.status().as_u16();
    let mut builder = hyper::Response::builder().status(status);

    for (key, value) in actix_response.headers() {
        if let Ok(val_str) = value.to_str() {
            builder = builder.header(key.as_str(), val_str);
        }
    }

    // For now, we'll handle the body synchronously
    // In a real implementation, we'd need to handle streaming
    builder
        .body(ResponseBody::from(""))
        .map_err(|e| Box::new(e) as Error)
}

/// Create a stream body for streaming responses
pub async fn create_stream_body(
    tx: mpsc::Sender<Result<Frame<Bytes>, Error>>,
    data: Vec<u8>,
) -> Result<(), Error> {
    let frame = Frame::data(Bytes::from(data));
    tx.send(Ok(frame))
        .await
        .map_err(|e| Box::new(e) as Error)?;
    Ok(())
}



/// Stream response helper for Actix-style streaming
pub fn stream_response<F, Fut>(
    generator: F,
) -> impl std::future::Future<Output = hyper::Response<ResponseBody>>
where
    F: FnOnce(mpsc::Sender<Result<Bytes, std::io::Error>>) -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    async move {
        let (tx, rx) = mpsc::channel::<Result<Bytes, std::io::Error>>(10);

        tokio::spawn(async move {
            generator(tx).await;
        });

        let stream = ReceiverStream::new(rx);
        let mapped_stream = tokio_stream::StreamExt::map(stream, |result| {
            result.map(Frame::data).map_err(|e| Box::new(e) as Error)
        });

        let stream_body = http_body_util::StreamBody::new(mapped_stream);

        hyper::Response::builder()
            .header("content-type", "text/event-stream")
            .header("cache-control", "no-cache")
            .body(ResponseBody::from(stream_body))
            .unwrap()
    }
}
