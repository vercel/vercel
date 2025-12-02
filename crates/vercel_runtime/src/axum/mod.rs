use axum::response::Response;
use axum::{body::Body, response::IntoResponse};
use http_body_util::BodyExt;
use hyper::body::{Bytes, Frame};
use std::convert::Infallible;
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
    pub fn is_streaming_response(headers: &axum::http::HeaderMap) -> bool {
        headers
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .map(|ct| ct.contains("text/event-stream") || ct.contains("application/json"))
            .unwrap_or(false)
    }

    /// Creates a stream body from an axum Body for streaming responses
    pub async fn create_stream_body(body: Body) -> Result<ResponseBody, Error> {
        // Create a channel to manually pump the body frames
        let (tx, rx) = mpsc::channel::<Result<Frame<Bytes>, Error>>(10);

        tokio::spawn(async move {
            let mut body = body;
            while let Some(frame) = body.frame().await {
                match frame {
                    Ok(f) => {
                        if tx.send(Ok(f)).await.is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(Err(Box::new(e) as Error)).await;
                        break;
                    }
                }
            }
        });

        let stream = ReceiverStream::new(rx);
        let stream_body = http_body_util::StreamBody::new(stream);
        Ok(stream_body.into())
    }

    /// Process an Axum response, converting body based on whether it's streaming
    pub async fn process_response(
        response: Response<Body>,
    ) -> Result<Response<ResponseBody>, Error> {
        let (parts, body) = response.into_parts();

        // Check if this is a streaming response based on headers
        let is_streaming = Self::is_streaming_response(&parts.headers);

        if is_streaming {
            // For streaming responses, we need to manually build the stream body
            let stream_body = Self::create_stream_body(body).await?;
            Ok(Response::from_parts(parts, stream_body))
        } else {
            // For non-streaming responses, convert to bytes as before
            let bytes = axum::body::to_bytes(body, usize::MAX)
                .await
                .map_err(|e| Box::new(e) as Error)?;
            Ok(Response::from_parts(parts, bytes.into()))
        }
    }
}

/// A Tower layer that automatically handles streaming responses.
///
/// This layer checks if a response is a streaming response based on content-type headers
/// and automatically converts the body to the appropriate format for streaming or non-streaming responses.
#[derive(Clone)]
pub struct StreamingLayer;

impl StreamingLayer {
    pub fn new() -> Self {
        Self
    }
}

impl Default for StreamingLayer {
    fn default() -> Self {
        Self::new()
    }
}

impl<S> Layer<S> for StreamingLayer {
    type Service = StreamingService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        StreamingService { inner }
    }
}

#[derive(Clone)]
pub struct StreamingService<S> {
    inner: S,
}

impl<S> Service<axum::http::Request<Body>> for StreamingService<S>
where
    S: Service<axum::http::Request<Body>, Response = Response<Body>, Error = Infallible>
        + Send
        + 'static,
    S::Future: Send + 'static,
{
    type Response = Response<ResponseBody>;
    type Error = Infallible;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: axum::http::Request<Body>) -> Self::Future {
        let future = self.inner.call(req);

        Box::pin(async move {
            let response = future.await?;
            // Use the utility function to process the response
            match StreamingUtils::process_response(response).await {
                Ok(processed_response) => Ok(processed_response),
                Err(_) => {
                    // Fallback to empty body on error
                    let empty_body = "".into();
                    let fallback_response =
                        Response::builder().status(500).body(empty_body).unwrap();
                    Ok(fallback_response)
                }
            }
        })
    }
}

/// A Tower layer that converts Vercel requests/responses to work with Axum
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

#[derive(Clone)]
pub struct VercelService<S> {
    inner: S,
}

impl<S> Service<(AppState, Request)> for VercelService<S>
where
    S: Service<
            axum::http::Request<axum::body::Body>,
            Response = axum::response::Response<axum::body::Body>,
            Error = std::convert::Infallible,
        > + Send
        + Clone
        + 'static,
    S::Future: Send + 'static,
{
    type Response = hyper::Response<ResponseBody>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        match self.inner.poll_ready(cx) {
            Poll::Ready(Ok(())) => Poll::Ready(Ok(())),
            Poll::Ready(Err(_)) => Poll::Ready(Err("Service error".into())),
            Poll::Pending => Poll::Pending,
        }
    }

    fn call(&mut self, (_state, req): (AppState, Request)) -> Self::Future {
        let mut service = self.inner.clone();

        Box::pin(async move {
            let (parts, body) = req.into_parts();
            let body_bytes = http_body_util::BodyExt::collect(body)
                .await
                .map_err(|e| Box::new(e) as Error)?
                .to_bytes();
            let axum_body = axum::body::Body::from(body_bytes);
            let axum_req = axum::http::Request::from_parts(parts, axum_body);

            match tower::ServiceExt::ready(&mut service).await {
                Ok(ready_service) => match tower::Service::call(ready_service, axum_req).await {
                    Ok(axum_response) => StreamingUtils::process_response(axum_response).await,
                    Err(_) => Ok(hyper::Response::builder()
                        .status(500)
                        .body("Internal Server Error".into())
                        .unwrap()),
                },
                Err(_) => Ok(hyper::Response::builder()
                    .status(500)
                    .body("Service Not Ready".into())
                    .unwrap()),
            }
        })
    }
}

pub fn stream_response<F, Fut>(generator: F) -> impl IntoResponse
where
    F: FnOnce(mpsc::Sender<Result<Bytes, std::io::Error>>) -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    let (tx, rx) = mpsc::channel::<Result<Bytes, std::io::Error>>(10);

    tokio::spawn(async move {
        generator(tx).await;
    });

    let stream = ReceiverStream::new(rx);

    axum::response::Response::builder()
        .header("content-type", "text/event-stream")
        .header("cache-control", "no-cache")
        .body(axum::body::Body::from_stream(stream))
        .unwrap()
}
