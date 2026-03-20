use http_body_util::BodyExt;
use hyper::body::Bytes;
use hyper::{Response, StatusCode};

pub type Error = Box<dyn std::error::Error + Send + Sync>;

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

impl From<Vec<u8>> for ResponseBody {
    fn from(value: Vec<u8>) -> Self {
        let bytes = Bytes::from(value);
        let body = http_body_util::Full::new(bytes).map_err(|e| Box::new(e) as Error);
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

impl From<serde_json::Value> for ResponseBody {
    fn from(value: serde_json::Value) -> Self {
        let json = serde_json::to_string(&value).unwrap_or_else(|_| "{}".to_string());
        let bytes = Bytes::from(json);
        let body = http_body_util::Full::new(bytes).map_err(|e| Box::new(e) as Error);
        ResponseBody(body.boxed())
    }
}

impl From<()> for ResponseBody {
    fn from(_: ()) -> Self {
        let body = http_body_util::Full::new(Bytes::new()).map_err(|e| Box::new(e) as Error);
        ResponseBody(body.boxed())
    }
}

impl<T: AsRef<str>> From<Html<T>> for ResponseBody {
    fn from(value: Html<T>) -> Self {
        let body = http_body_util::Full::new(Bytes::from(value.0.as_ref().to_string()))
            .map_err(|e| Box::new(e) as Error);
        ResponseBody(body.boxed())
    }
}

pub trait IntoFunctionResponse {
    /// Transform the output of a handler function into a response object
    fn into_response(self) -> Result<Response<ResponseBody>, Error>;
}

impl IntoFunctionResponse for Response<ResponseBody> {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        Ok(self)
    }
}

impl<T> IntoFunctionResponse for Result<T, Error>
where
    T: IntoFunctionResponse,
{
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        match self {
            Ok(value) => value.into_response(),
            Err(err) => {
                let error_msg = format!("{{\"error\": \"{}\"}}", err);
                let response = Response::builder()
                    .status(500)
                    .header("content-type", "application/json")
                    .body(ResponseBody::from(error_msg))?;
                Ok(response)
            }
        }
    }
}

impl IntoFunctionResponse for String {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let response = Response::builder()
            .status(200)
            .header("content-type", "text/plain")
            .body(ResponseBody::from(self))?;
        Ok(response)
    }
}

impl IntoFunctionResponse for &str {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let response = Response::builder()
            .status(200)
            .header("content-type", "text/plain")
            .body(ResponseBody::from(self))?;
        Ok(response)
    }
}

impl IntoFunctionResponse for Bytes {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let response = Response::builder()
            .status(200)
            .body(ResponseBody::from(self))?;
        Ok(response)
    }
}

impl IntoFunctionResponse for Vec<u8> {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let response = Response::builder()
            .status(200)
            .header("content-type", "application/octet-stream")
            .body(ResponseBody::from(self))?;
        Ok(response)
    }
}

impl IntoFunctionResponse for serde_json::Value {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let response = Response::builder()
            .status(200)
            .header("content-type", "application/json")
            .body(ResponseBody::from(self))?;
        Ok(response)
    }
}

impl IntoFunctionResponse for Response<serde_json::Value> {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let (parts, body) = self.into_parts();
        let response = Response::from_parts(parts, ResponseBody::from(body));
        Ok(response)
    }
}

impl IntoFunctionResponse for Response<String> {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let (parts, body) = self.into_parts();
        let response = Response::from_parts(parts, ResponseBody::from(body));
        Ok(response)
    }
}

impl IntoFunctionResponse for Response<&str> {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let (parts, body) = self.into_parts();
        let response = Response::from_parts(parts, ResponseBody::from(body));
        Ok(response)
    }
}

impl IntoFunctionResponse for Response<Vec<u8>> {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let (parts, body) = self.into_parts();
        let response = Response::from_parts(parts, ResponseBody::from(body));
        Ok(response)
    }
}

impl IntoFunctionResponse for Response<Bytes> {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let (parts, body) = self.into_parts();
        let response = Response::from_parts(parts, ResponseBody::from(body));
        Ok(response)
    }
}

impl<T> IntoFunctionResponse for Response<http_body_util::StreamBody<T>>
where
    T: tokio_stream::Stream<Item = Result<hyper::body::Frame<hyper::body::Bytes>, Error>>
        + Send
        + Sync
        + 'static,
{
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let (parts, body) = self.into_parts();
        let response = Response::from_parts(parts, ResponseBody::from(body));
        Ok(response)
    }
}

impl IntoFunctionResponse for StatusCode {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let response = Response::builder()
            .status(self)
            .body(ResponseBody::from(""))?;
        Ok(response)
    }
}

impl IntoFunctionResponse for () {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let response = Response::builder()
            .status(204)
            .body(ResponseBody::from(()))?;
        Ok(response)
    }
}

impl<T> IntoFunctionResponse for Option<T>
where
    T: IntoFunctionResponse,
{
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        match self {
            Some(value) => value.into_response(),
            None => {
                let response = Response::builder()
                    .status(404)
                    .body(ResponseBody::from("Not Found"))?;
                Ok(response)
            }
        }
    }
}

pub struct Html<T>(pub T);

impl<T: AsRef<str>> IntoFunctionResponse for Html<T> {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let response = Response::builder()
            .status(200)
            .header("content-type", "text/html; charset=utf-8")
            .body(ResponseBody::from(self))?;
        Ok(response)
    }
}

impl<T: AsRef<str>> IntoFunctionResponse for Response<Html<T>> {
    fn into_response(self) -> Result<Response<ResponseBody>, Error> {
        let (parts, body) = self.into_parts();
        let response = Response::from_parts(parts, ResponseBody::from(body));
        Ok(response)
    }
}
