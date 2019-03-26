use http::{StatusCode};
use now_lambda::{error::NowError, lambda, IntoResponse, Request, Response};
use std::error::Error;
use std::fs::read_to_string;

fn handler(_: Request) -> Result<impl IntoResponse, NowError> {
  let text = read_to_string("./static/sample.txt").unwrap();
  let response = Response::builder()
    .status(StatusCode::OK)
    .header("Content-Type", "text/plain")
    .body(text)
    .expect("Internal Server Error");

    Ok(response)
}

fn main() -> Result<(), Box<dyn Error>> {
    Ok(lambda!(handler))
}
