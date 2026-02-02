//! Python semantic analyzer.

mod bindings {
    include!(env!("WIT_BINDINGS"));
}
mod entrypoint;

bindings::export!(PythonAnalyzer with_types_in bindings);

struct PythonAnalyzer;

use crate::entrypoint::contains_app_or_handler_impl;

impl crate::bindings::Guest for PythonAnalyzer {
    /// Check if Python source code contains or exports:
    /// - A top-level 'app' callable (e.g., Flask, FastAPI, Sanic apps)
    /// - A top-level 'handler' class (e.g., BaseHTTPRequestHandler subclass)
    ///
    /// Returns true if found, false otherwise.
    /// Returns false for invalid Python syntax.
    fn contains_app_or_handler(source: String) -> bool {
        contains_app_or_handler_impl(&source)
    }
}
