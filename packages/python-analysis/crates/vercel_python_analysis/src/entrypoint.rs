//! Entrypoint analysis for Python source code.
//!
//! Currently detects:
//! - Top-level 'app' callables (Flask, FastAPI, Sanic, etc.)
//! - Top-level 'handler' classes (BaseHTTPRequestHandler subclasses)

use ruff_python_ast::{Expr, Stmt};
use ruff_python_parser::parse_module;

pub(crate) fn contains_app_or_handler_impl(source: &str) -> bool {
    let parsed = match parse_module(source) {
        Ok(parsed) => parsed,
        Err(_) => return false, // Couldn't parse
    };

    // Iterate over top-level statements
    for stmt in parsed.suite() {
        match stmt {
            // Check for top-level assignment to 'app'
            // e.g., app = Sanic() or app = Flask(__name__) or app = create_app()
            Stmt::Assign(assign) => {
                for target in &assign.targets {
                    if is_name_expr(target, "app") {
                        return true;
                    }
                }
            }

            // Check for annotated assignment to 'app'
            // e.g., app: Sanic = Sanic()
            Stmt::AnnAssign(ann_assign) => {
                if is_name_expr(&ann_assign.target, "app") {
                    return true;
                }
            }

            // Check for function named 'app' (sync or async)
            // e.g., def app(environ, start_response): ...
            // e.g., async def app(scope, receive, send): ...
            Stmt::FunctionDef(func_def) => {
                if func_def.name.as_str() == "app" {
                    return true;
                }
            }

            // Check for import of 'app'
            // e.g., from server import app
            // e.g., from server import application as app
            Stmt::ImportFrom(import_from) => {
                for alias in &import_from.names {
                    // alias.asname is the 'as' name, alias.name is the original name
                    // If aliased, check asname; otherwise check the original name
                    let imported_as = alias
                        .asname
                        .as_ref()
                        .map(|id| id.as_str())
                        .unwrap_or_else(|| alias.name.as_str());
                    if imported_as == "app" {
                        return true;
                    }
                }
            }

            // Check for top-level class named 'handler' (case-insensitive)
            // e.g., class handler(BaseHTTPRequestHandler):
            Stmt::ClassDef(class_def) => {
                if class_def.name.as_str().eq_ignore_ascii_case("handler") {
                    return true;
                }
            }

            // Other statements are not relevant
            _ => {}
        }
    }

    false
}

fn is_name_expr(expr: &Expr, name: &str) -> bool {
    match expr {
        Expr::Name(name_expr) => name_expr.id.as_str() == name,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flask_app() {
        let source = r#"
from flask import Flask
app = Flask(__name__)
"#;
        assert!(contains_app_or_handler_impl(source));
    }

    #[test]
    fn test_fastapi_app() {
        let source = r#"
from fastapi import FastAPI
app = FastAPI()
"#;
        assert!(contains_app_or_handler_impl(source));
    }

    #[test]
    fn test_annotated_app() {
        let source = r#"
from sanic import Sanic
app: Sanic = Sanic()
"#;
        assert!(contains_app_or_handler_impl(source));
    }

    #[test]
    fn test_wsgi_function() {
        let source = r#"
def app(environ, start_response):
    pass
"#;
        assert!(contains_app_or_handler_impl(source));
    }

    #[test]
    fn test_asgi_async_function() {
        let source = r#"
async def app(scope, receive, send):
    pass
"#;
        assert!(contains_app_or_handler_impl(source));
    }

    #[test]
    fn test_import_app() {
        let source = r#"
from server import app
"#;
        assert!(contains_app_or_handler_impl(source));
    }

    #[test]
    fn test_import_app_aliased() {
        let source = r#"
from server import application as app
"#;
        assert!(contains_app_or_handler_impl(source));
    }

    #[test]
    fn test_handler_class() {
        let source = r#"
from http.server import BaseHTTPRequestHandler
class handler(BaseHTTPRequestHandler):
    pass
"#;
        assert!(contains_app_or_handler_impl(source));
    }

    #[test]
    fn test_handler_class_uppercase() {
        let source = r#"
from http.server import BaseHTTPRequestHandler
class Handler(BaseHTTPRequestHandler):
    pass
"#;
        assert!(contains_app_or_handler_impl(source));
    }

    #[test]
    fn test_no_app_or_handler() {
        let source = r#"
def main():
    print("Hello")
"#;
        assert!(!contains_app_or_handler_impl(source));
    }

    #[test]
    fn test_invalid_syntax() {
        let source = r#"
def invalid(
"#;
        assert!(!contains_app_or_handler_impl(source));
    }

    #[test]
    fn test_nested_app_not_detected() {
        // app inside a function should not be detected (not top-level)
        let source = r#"
def create():
    app = Flask(__name__)
    return app
"#;
        assert!(!contains_app_or_handler_impl(source));
    }
}
