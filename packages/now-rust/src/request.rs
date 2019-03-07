use std::{borrow::Cow, fmt, mem};

use http::{self, header::HeaderValue, HeaderMap, Method, Request as HttpRequest};
use serde::de::{Deserializer, Error as DeError, MapAccess, Visitor};
use serde_derive::Deserialize;

use crate::body::Body;

/// Representation of a Now Lambda proxy event data
#[doc(hidden)]
#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NowRequest<'a> {
    pub(crate) host: Cow<'a, str>,
    pub(crate) path: Cow<'a, str>,
    #[serde(deserialize_with = "deserialize_method")]
    pub(crate) method: Method,
    #[serde(deserialize_with = "deserialize_headers")]
    pub(crate) headers: HeaderMap<HeaderValue>,
    pub(crate) body: Option<Cow<'a, str>>,
    pub(crate) encoding: Option<String>,
}

#[doc(hidden)]
#[derive(Deserialize, Debug, Default)]
pub(crate) struct NowEvent<'a> {
    #[serde(rename = "Action")]
    action: Cow<'a, str>,
    pub(crate) body: Cow<'a, str>,
}

fn deserialize_method<'de, D>(deserializer: D) -> Result<Method, D::Error>
where
    D: Deserializer<'de>,
{
    struct MethodVisitor;

    impl<'de> Visitor<'de> for MethodVisitor {
        type Value = Method;

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(formatter, "a Method")
        }

        fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
        where
            E: DeError,
        {
            v.parse().map_err(E::custom)
        }
    }

    deserializer.deserialize_str(MethodVisitor)
}

fn deserialize_headers<'de, D>(deserializer: D) -> Result<HeaderMap<HeaderValue>, D::Error>
where
    D: Deserializer<'de>,
{
    struct HeaderVisitor;

    impl<'de> Visitor<'de> for HeaderVisitor {
        type Value = HeaderMap<HeaderValue>;

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(formatter, "a HeaderMap<HeaderValue>")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: MapAccess<'de>,
        {
            let mut headers = http::HeaderMap::new();
            while let Some((key, value)) = map.next_entry::<Cow<'_, str>, Cow<'_, str>>()? {
                let header_name = key
                    .parse::<http::header::HeaderName>()
                    .map_err(A::Error::custom)?;
                let header_value =
                    http::header::HeaderValue::from_shared(value.into_owned().into())
                        .map_err(A::Error::custom)?;
                headers.append(header_name, header_value);
            }
            Ok(headers)
        }
    }

    deserializer.deserialize_map(HeaderVisitor)
}

impl<'a> From<NowRequest<'a>> for HttpRequest<Body> {
    fn from(value: NowRequest<'_>) -> Self {
        let NowRequest {
            host,
            path,
            method,
            headers,
            body,
            encoding,
        } = value;

        // build an http::Request<now_lambda::Body> from a now_lambda::NowRequest
        let mut builder = HttpRequest::builder();
        builder.method(method);
        builder.uri({ format!("https://{}{}", host, path) });

        let mut req = builder
            .body(match (body, encoding) {
                (Some(ref b), Some(ref encoding)) if encoding == "base64" => {
                    // todo: document failure behavior
                    Body::from(::base64::decode(b.as_ref()).unwrap_or_default())
                }
                (Some(b), _) => Body::from(b.into_owned()),
                _ => Body::from(()),
            })
            .expect("failed to build request");

        // no builder method that sets headers in batch
        mem::replace(req.headers_mut(), headers);

        req
    }
}
