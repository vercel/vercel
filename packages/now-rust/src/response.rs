//! Response types

use http::{
    header::{HeaderMap, HeaderValue},
    Response,
};
use serde::ser::{Error as SerError, SerializeMap, Serializer};
use serde_derive::Serialize;

use crate::body::Body;

/// Representation of a Now Lambda response
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NowResponse {
    pub status_code: u16,
    #[serde(
        skip_serializing_if = "HeaderMap::is_empty",
        serialize_with = "serialize_headers"
    )]
    pub headers: HeaderMap<HeaderValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<Body>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encoding: Option<String>,
}

impl Default for NowResponse {
    fn default() -> Self {
        Self {
            status_code: 200,
            headers: Default::default(),
            body: Default::default(),
            encoding: Default::default(),
        }
    }
}

fn serialize_headers<S>(headers: &HeaderMap<HeaderValue>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let mut map = serializer.serialize_map(Some(headers.keys_len()))?;
    for key in headers.keys() {
        let map_value = headers[key].to_str().map_err(S::Error::custom)?;
        map.serialize_entry(key.as_str(), map_value)?;
    }
    map.end()
}

impl<T> From<Response<T>> for NowResponse
where
    T: Into<Body>,
{
    fn from(value: Response<T>) -> Self {
        let (parts, bod) = value.into_parts();
        let (encoding, body) = match bod.into() {
            Body::Empty => (None, None),
            b @ Body::Text(_) => (None, Some(b)),
            b @ Body::Binary(_) => (Some("base64".to_string()), Some(b)),
        };
        NowResponse {
            status_code: parts.status.as_u16(),
            body,
            headers: parts.headers,
            encoding,
        }
    }
}

/// A conversion of self into a `Response`
///
/// Implementations for `Response<B> where B: Into<Body>`,
/// `B where B: Into<Body>` and `serde_json::Value` are provided
/// by default
///
/// # example
///
/// ```rust
/// use now_lambda::{Body, IntoResponse, Response};
///
/// assert_eq!(
///   "hello".into_response().body(),
///   Response::new(Body::from("hello")).body()
/// );
/// ```
pub trait IntoResponse {
    /// Return a translation of `self` into a `Response<Body>`
    fn into_response(self) -> Response<Body>;
}

impl<B> IntoResponse for Response<B>
where
    B: Into<Body>,
{
    fn into_response(self) -> Response<Body> {
        let (parts, body) = self.into_parts();
        Response::from_parts(parts, body.into())
    }
}

impl<B> IntoResponse for B
where
    B: Into<Body>,
{
    fn into_response(self) -> Response<Body> {
        Response::new(self.into())
    }
}

impl IntoResponse for serde_json::Value {
    fn into_response(self) -> Response<Body> {
        Response::builder()
            .header(http::header::CONTENT_TYPE, "application/json")
            .body(
                serde_json::to_string(&self)
                    .expect("unable to serialize serde_json::Value")
                    .into(),
            )
            .expect("unable to build http::Response")
    }
}
