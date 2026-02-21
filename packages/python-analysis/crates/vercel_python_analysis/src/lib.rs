//! Python semantic analyzer.

mod bindings {
    include!(env!("WIT_BINDINGS"));
}
mod entrypoint;
mod dist_metadata;

bindings::export!(PythonAnalyzer with_types_in bindings);

struct PythonAnalyzer;

use crate::bindings::{DistMetadata, DirectUrlInfo, RecordEntry};
use crate::entrypoint::{
    contains_app_or_handler_impl,
    get_string_constant_impl,
    parse_django_settings_module_impl,
};

impl crate::bindings::Guest for PythonAnalyzer {
    /// Check if Python source code contains or exports:
    /// - A top-level 'app' callable (e.g., Flask, FastAPI, Sanic apps)
    /// - A top-level 'application' callable (e.g., Django)
    /// - A top-level 'handler' class (e.g., BaseHTTPRequestHandler subclass)
    ///
    /// Returns true if found, false otherwise.
    /// Returns false for invalid Python syntax.
    fn contains_app_or_handler(source: String) -> bool {
        contains_app_or_handler_impl(&source)
    }

    /// Extract the string value of a top-level constant with the given name.
    /// Only considers simple assignments (`NAME = "string"`) and annotated assignments
    /// (`NAME: str = "string"`) at module level. Returns the first matching string
    /// value, or None if not found or the value is not a string literal.
    fn get_string_constant(source: String, name: String) -> Option<String> {
        get_string_constant_impl(&source, &name)
    }

    /// Extract the default value from `os.environ.setdefault('DJANGO_SETTINGS_MODULE', '...')`
    /// in Python source (e.g. manage.py). Returns the second argument (e.g. `'app.settings'`)
    /// only if exactly one such call exists; returns None if there are zero or more than one.
    fn parse_django_settings_module(source: String) -> Option<String> {
        parse_django_settings_module_impl(&source)
    }

    fn parse_dist_metadata(content: Vec<u8>) -> Result<DistMetadata, String> {
        dist_metadata::metadata::parse(&content)
    }

    fn parse_record(content: String) -> Result<Vec<RecordEntry>, String> {
        dist_metadata::record::parse(&content)
    }

    fn parse_direct_url(content: String) -> Result<DirectUrlInfo, String> {
        dist_metadata::direct_url::parse(&content)
    }

    fn normalize_package_name(name: String) -> String {
        dist_metadata::normalize::normalize(&name)
    }
}
