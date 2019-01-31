//! Provides a Now Lambda oriented request and response body entity interface

use std::{borrow::Cow, ops::Deref};

use base64::display::Base64Display;
use serde::ser::{Error as SerError, Serialize, Serializer};

/// Representation of http request and response bodies as supported
/// by Zeit Now v2.
///
/// These come in three flavors
/// * `Empty` ( no body )
/// * `Text` ( text data )
/// * `Binary` ( binary data )
///
/// Body types can be `Deref` and `AsRef`'d into `[u8]` types much like the `hyper` crate
///
/// # Examples
///
/// Body types are inferred with `From` implementations.
///
/// ## Text
///
/// Types like `String`, `str` whose type reflects
/// text produce `Body::Text` variants
///
/// ```
/// assert!(match now_lambda::Body::from("text") {
///   now_lambda::Body::Text(_) => true,
///   _ => false
/// })
/// ```
///
/// ## Binary
///
/// Types like `Vec<u8>` and `&[u8]` whose types reflect raw bytes produce `Body::Binary` variants
///
/// ```
/// assert!(match now_lambda::Body::from("text".as_bytes()) {
///   now_lambda::Body::Binary(_) => true,
///   _ => false
/// })
/// ```
///
/// `Binary` responses bodies will automatically get base64 encoded.
///
/// ## Empty
///
/// The unit type ( `()` ) whose type represents an empty value produces `Body::Empty` variants
///
/// ```
/// assert!(match now_lambda::Body::from(()) {
///   now_lambda::Body::Empty => true,
///   _ => false
/// })
/// ```
#[derive(Debug, PartialEq)]
pub enum Body {
    /// An empty body
    Empty,
    /// A body containing string data
    Text(String),
    /// A body containing binary data
    Binary(Vec<u8>),
}

impl Default for Body {
    fn default() -> Self {
        Body::Empty
    }
}

impl From<()> for Body {
    fn from(_: ()) -> Self {
        Body::Empty
    }
}

impl<'a> From<&'a str> for Body {
    fn from(s: &'a str) -> Self {
        Body::Text(s.into())
    }
}

impl From<String> for Body {
    fn from(b: String) -> Self {
        Body::Text(b)
    }
}

impl From<Cow<'static, str>> for Body {
    #[inline]
    fn from(cow: Cow<'static, str>) -> Body {
        match cow {
            Cow::Borrowed(b) => Body::from(b.to_owned()),
            Cow::Owned(o) => Body::from(o),
        }
    }
}

impl From<Cow<'static, [u8]>> for Body {
    #[inline]
    fn from(cow: Cow<'static, [u8]>) -> Body {
        match cow {
            Cow::Borrowed(b) => Body::from(b),
            Cow::Owned(o) => Body::from(o),
        }
    }
}

impl From<Vec<u8>> for Body {
    fn from(b: Vec<u8>) -> Self {
        Body::Binary(b)
    }
}

impl<'a> From<&'a [u8]> for Body {
    fn from(b: &'a [u8]) -> Self {
        Body::Binary(b.to_vec())
    }
}

impl Deref for Body {
    type Target = [u8];

    #[inline]
    fn deref(&self) -> &Self::Target {
        self.as_ref()
    }
}

impl AsRef<[u8]> for Body {
    #[inline]
    fn as_ref(&self) -> &[u8] {
        match self {
            Body::Empty => &[],
            Body::Text(ref bytes) => bytes.as_ref(),
            Body::Binary(ref bytes) => bytes.as_ref(),
        }
    }
}

impl<'a> Serialize for Body {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Body::Text(data) => serializer
                .serialize_str(::std::str::from_utf8(data.as_ref()).map_err(S::Error::custom)?),
            Body::Binary(data) => {
                serializer.collect_str(&Base64Display::with_config(data, base64::STANDARD))
            }
            Body::Empty => serializer.serialize_unit(),
        }
    }
}
