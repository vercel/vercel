//! Entrypoint analysis for Python source code.
//!
//! Currently detects:
//! - Top-level 'app' callables (Flask, FastAPI, Sanic, etc.)
//! - Top-level 'application' callables (Django)
//! - Top-level 'handler' classes (BaseHTTPRequestHandler subclasses)

use ruff_python_ast::visitor::{walk_body, walk_expr, Visitor};
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
            // Check for top-level assignment to 'app' or 'application'
            // e.g., app = Sanic() or app = Flask(__name__) or app = create_app()
            Stmt::Assign(assign) => {
                for target in &assign.targets {
                    if is_name_expr(target, "app") || is_name_expr(target, "application") {
                        return true;
                    }
                }
            }

            // Check for annotated assignment to 'app' or 'application'
            // e.g., app: Sanic = Sanic()
            Stmt::AnnAssign(ann_assign) => {
                if is_name_expr(&ann_assign.target, "app") || is_name_expr(&ann_assign.target, "application") {
                    return true;
                }
            }

            // Check for function named 'app' or 'application' (sync or async)
            // e.g., def app(environ, start_response): ...
            // e.g., async def app(scope, receive, send): ...
            Stmt::FunctionDef(func_def) => {
                if func_def.name.as_str() == "app" || func_def.name.as_str() == "application" {
                    return true;
                }
            }

            // Check for import of 'app' or 'application'
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
                    if imported_as == "app" || imported_as == "application" {
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

/// Extract the string value of a top-level constant with the given name.
/// Only considers simple assignments (`NAME = "string"`) and annotated assignments
/// (`NAME: str = "string"`) at module level. Returns the first matching string
/// value, or None if not found or the value is not a string literal.
pub(crate) fn get_string_constant_impl(source: &str, name: &str) -> Option<String> {
    let parsed = match parse_module(source) {
        Ok(parsed) => parsed,
        Err(_) => return None,
    };
    for stmt in parsed.suite() {
        match stmt {
            Stmt::Assign(assign) => {
                if assign.targets.len() == 1 && is_name_expr(&assign.targets[0], name) {
                    if let Some(s) = expr_to_string_literal(&assign.value) {
                        return Some(s);
                    }
                }
            }
            Stmt::AnnAssign(ann_assign) => {
                if is_name_expr(&ann_assign.target, name) {
                    if let Some(value) = &ann_assign.value {
                        if let Some(s) = expr_to_string_literal(value) {
                            return Some(s);
                        }
                    }
                }
            }
            _ => {}
        }
    }
    None
}

fn is_name_expr(expr: &Expr, name: &str) -> bool {
    match expr {
        Expr::Name(name_expr) => name_expr.id.as_str() == name,
        _ => false,
    }
}

fn is_name_or_attribute_expr(expr: &Expr, path: &[&str]) -> bool {
    match path {
        [] => false,
        [single] => matches!(expr, Expr::Name(n) if n.id.as_str() == *single),
        _ => {
            let (last, rest) = path.split_last().unwrap();
            match expr {
                Expr::Attribute(attr) if attr.attr.as_str() == *last => {
                    is_name_or_attribute_expr(attr.value.as_ref(), rest)
                }
                _ => false,
            }
        }
    }
}

/// Extract the default value from os.environ.setdefault('DJANGO_SETTINGS_MODULE', '...')
/// by parsing the Python source and walking the AST. Returns the second argument
/// (e.g. 'app.settings') only if exactly one such call exists; returns None if
/// there are zero or more than one.
pub(crate) fn parse_django_settings_module_impl(source: &str) -> Option<String> {
    let parsed = match parse_module(source) {
        Ok(parsed) => parsed,
        Err(_) => return None,
    };
    let mut finder = DjangoSettingsFinder {
        matches: Vec::new(),
    };
    walk_body(&mut finder, parsed.suite());
    match finder.matches.len() {
        1 => Some(finder.matches.into_iter().next().unwrap()),
        _ => None,
    }
}

/// Visitor that walks the AST and collects every DJANGO_SETTINGS_MODULE value
/// from os.environ.setdefault('DJANGO_SETTINGS_MODULE', ...) calls.
struct DjangoSettingsFinder {
    matches: Vec<String>,
}

impl Visitor<'_> for DjangoSettingsFinder {
    fn visit_expr(&mut self, expr: &Expr) {
        if let Expr::Call(call) = expr {
            if let Some(settings) = match_django_setdefault_call(call) {
                self.matches.push(settings);
            }
        }
        walk_expr(self, expr);
    }
}

/// Check if this Call is os.environ.setdefault('DJANGO_SETTINGS_MODULE', <second>)
/// and return the second argument as a string if it is a string literal.
fn match_django_setdefault_call(call: &ruff_python_ast::ExprCall) -> Option<String> {
    if !is_name_or_attribute_expr(call.func.as_ref(), &["os", "environ", "setdefault"]) {
        return None;
    }
    let args = &call.arguments.args;
    if args.len() < 2 {
        return None;
    }
    let first_str = expr_to_string_literal(&args[0])?;
    if first_str != "DJANGO_SETTINGS_MODULE" {
        return None;
    }
    expr_to_string_literal(&args[1])
}

fn expr_to_string_literal(expr: &Expr) -> Option<String> {
    match expr {
        Expr::StringLiteral(string_lit) => Some(string_lit.value.to_str().to_string()),
        _ => None,
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

    // -------------------------------------------------------------------------
    // get_string_constant_impl
    // -------------------------------------------------------------------------

    #[test]
    fn test_get_string_constant_simple() {
        let source = r#"VERSION = "1.0.0""#;
        assert_eq!(
            get_string_constant_impl(source, "VERSION"),
            Some("1.0.0".to_string())
        );
    }

    #[test]
    fn test_get_string_constant_annotated() {
        let source = r#"APP_NAME: str = "myapp""#;
        assert_eq!(
            get_string_constant_impl(source, "APP_NAME"),
            Some("myapp".to_string())
        );
    }

    #[test]
    fn test_get_string_constant_not_found() {
        let source = r#"VERSION = "1.0.0""#;
        assert_eq!(get_string_constant_impl(source, "OTHER"), None);
    }

    #[test]
    fn test_get_string_constant_non_string_value() {
        let source = r#"COUNT = 42"#;
        assert_eq!(get_string_constant_impl(source, "COUNT"), None);
    }

    // -------------------------------------------------------------------------
    // parse_django_settings_module_impl
    // -------------------------------------------------------------------------

    #[test]
    fn test_parse_django_settings_module_in_main() {
        let source = r#"
#!/usr/bin/env python
import os
import sys

def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hello.settings')
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()
"#;
        assert_eq!(
            parse_django_settings_module_impl(source),
            Some("hello.settings".to_string())
        );
    }

    #[test]
    fn test_parse_django_settings_module_app_settings() {
        let source = r#"os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'app.settings')"#;
        assert_eq!(
            parse_django_settings_module_impl(source),
            Some("app.settings".to_string())
        );
    }

    #[test]
    fn test_parse_django_settings_module_double_quotes() {
        let source = r#"os.environ.setdefault("DJANGO_SETTINGS_MODULE", "myproject.settings")"#;
        assert_eq!(
            parse_django_settings_module_impl(source),
            Some("myproject.settings".to_string())
        );
    }

    #[test]
    fn test_parse_django_settings_module_not_found() {
        let source = r#"
import os
print("hello")
"#;
        assert_eq!(parse_django_settings_module_impl(source), None);
    }

    #[test]
    fn test_parse_django_settings_module_invalid_syntax() {
        let source = r#"os.environ.setdefault('DJANGO_SETTINGS_MODULE', "#;
        assert_eq!(parse_django_settings_module_impl(source), None);
    }

    #[test]
    fn test_parse_django_settings_module_multiple_matches() {
        let source = r#"
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'app.settings')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'other.settings')
"#;
        assert_eq!(parse_django_settings_module_impl(source), None);
    }
}
