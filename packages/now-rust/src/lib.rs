pub use http::{self, Response};
use lambda_runtime::{self as lambda, Context};
use log::{self, debug, error};
use serde_json::Error;
use tokio::runtime::Runtime as TokioRuntime;

mod body;
pub mod error;
pub mod request;
mod response;
mod strmap;

pub use crate::{body::Body, response::IntoResponse, strmap::StrMap};
use crate::{
    error::NowError,
    request::{NowEvent, NowRequest},
    response::NowResponse,
};

/// Type alias for `http::Request`s with a fixed `now_lambda::Body` body
pub type Request = http::Request<Body>;

/// Functions acting as Now Lambda handlers must conform to this type.
pub trait Handler<R, B, E> {
    /// Method to execute the handler function
    fn run(&mut self, event: http::Request<B>) -> Result<R, E>;
}

impl<Function, R, B, E> Handler<R, B, E> for Function
where
    Function: FnMut(http::Request<B>) -> Result<R, E>,
{
    fn run(&mut self, event: http::Request<B>) -> Result<R, E> {
        (*self)(event)
    }
}

/// Creates a new `lambda_runtime::Runtime` and begins polling for Now Lambda events
///
/// # Arguments
///
/// * `f` A type that conforms to the `Handler` interface.
///
/// # Panics
/// The function panics if the Lambda environment variables are not set.
pub fn start<R, B, E>(f: impl Handler<R, B, E>, runtime: Option<TokioRuntime>)
where
    B: From<Body>,
    E: Into<NowError>,
    R: IntoResponse,
{
    // handler requires a mutable ref
    let mut func = f;
    lambda::start(
        |e: NowEvent, _ctx: Context| {
            let req_str = e.body;
            let parse_result: Result<NowRequest, Error> = serde_json::from_str(&req_str);
            match parse_result {
                Ok(req) => {
                    debug!("Deserialized Now proxy request successfully");
                    let request: http::Request<Body> = req.into();
                    func.run(request.map(|b| b.into()))
                        .map(|resp| NowResponse::from(resp.into_response()))
                        .map_err(|e| e.into())
                }
                Err(e) => {
                    error!("Could not deserialize event body to NowRequest {}", e);
                    panic!("Could not deserialize event body to NowRequest {}", e);
                }
            }
        },
        runtime,
    )
}

/// A macro for starting new handler's poll for Now Lambda events
#[macro_export]
macro_rules! lambda {
    ($handler:expr) => {
        $crate::start($handler, None)
    };
    ($handler:expr, $runtime:expr) => {
        $crate::start($handler, Some($runtime))
    };
    ($handler:ident) => {
        $crate::start($handler, None)
    };
    ($handler:ident, $runtime:expr) => {
        $crate::start($handler, Some($runtime))
    };
}
