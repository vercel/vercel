use http;
use lambda_runtime::error::LambdaErrorExt;
use std::{error::Error, fmt};

/// This module implements a custom error currently over the AWS Lambda runtime,
/// which can be extended later to support more service providers.
#[derive(Debug)]
pub struct NowError {
    msg: String,
}
impl NowError {
    pub fn new(message: &str) -> NowError {
        NowError {
            msg: message.to_owned(),
        }
    }
}
impl fmt::Display for NowError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.msg)
    }
}

impl Error for NowError {}

impl From<std::num::ParseIntError> for NowError {
    fn from(i: std::num::ParseIntError) -> Self {
        NowError::new(&format!("{}", i))
    }
}

impl From<http::Error> for NowError {
    fn from(i: http::Error) -> Self {
        NowError::new(&format!("{}", i))
    }
}

// the value returned by the error_type function is included as the
// `errorType` in the AWS Lambda response
impl LambdaErrorExt for NowError {
    fn error_type(&self) -> &str {
        "NowError"
    }
}
