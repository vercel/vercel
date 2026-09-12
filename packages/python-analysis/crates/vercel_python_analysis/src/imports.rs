//! Import statement extraction for Python source code.
//!
//! Walks the module's statement tree and records every `import` /
//! `from ... import ...` with the syntactic context needed by the caller to
//! decide whether the import runs at module-import time:
//!
//! - Function and method bodies are lazy (recorded with
//!   `is_module_level = false`).
//! - `if TYPE_CHECKING:` blocks never run at runtime (`in_type_checking`).
//! - Everything else at module level — including If/Try/With/loop/class
//!   bodies — executes at import time and is descended into.

use ruff_python_ast::{Expr, Stmt};
use ruff_python_parser::parse_module;

use crate::bindings::ImportStmt;

/// Extract all import statements from Python source with their context.
/// Returns an empty vec for invalid syntax.
pub(crate) fn extract_imports_impl(source: &str) -> Vec<ImportStmt> {
    let parsed = match parse_module(source) {
        Ok(parsed) => parsed,
        Err(_) => return Vec::new(),
    };

    let mut out = Vec::new();
    walk_suite(parsed.suite(), false, false, &mut out);
    out
}

fn walk_suite(suite: &[Stmt], in_function: bool, in_type_checking: bool, out: &mut Vec<ImportStmt>) {
    for stmt in suite {
        match stmt {
            Stmt::Import(import) => {
                for alias in &import.names {
                    out.push(ImportStmt {
                        module: Some(alias.name.to_string()),
                        level: 0,
                        names: Vec::new(),
                        is_module_level: !in_function,
                        in_type_checking,
                    });
                }
            }
            Stmt::ImportFrom(import_from) => {
                out.push(ImportStmt {
                    module: import_from.module.as_ref().map(|m| m.to_string()),
                    level: u8::try_from(import_from.level).unwrap_or(u8::MAX),
                    names: import_from
                        .names
                        .iter()
                        .map(|alias| alias.name.to_string())
                        .collect(),
                    is_module_level: !in_function,
                    in_type_checking,
                });
            }
            // Function bodies are lazy: recorded but flagged not-module-level.
            // (Async functions are Stmt::FunctionDef with is_async = true.)
            Stmt::FunctionDef(_) => {
                walk_suite(stmt_body(stmt), true, in_type_checking, out);
            }
            // Class bodies execute at import time; methods within are lazy.
            Stmt::ClassDef(class_def) => {
                for sub in &class_def.body {
                    match sub {
                        Stmt::FunctionDef(_) => {
                            walk_suite(stmt_body(sub), true, in_type_checking, out);
                        }
                        _ => walk_suite(
                            std::slice::from_ref(sub),
                            in_function,
                            in_type_checking,
                            out,
                        ),
                    }
                }
            }
            Stmt::If(if_stmt) => {
                let branch_tc = in_type_checking || is_type_checking_test(&if_stmt.test);
                walk_suite(&if_stmt.body, in_function, branch_tc, out);
                for elif in &if_stmt.elif_else_clauses {
                    let clause_tc =
                        elif.test.as_ref().map_or(in_type_checking, |test| {
                            in_type_checking || is_type_checking_test(test)
                        });
                    walk_suite(&elif.body, in_function, clause_tc, out);
                }
            }
            Stmt::Try(try_stmt) => {
                walk_suite(&try_stmt.body, in_function, in_type_checking, out);
                for handler in &try_stmt.handlers {
                    let ruff_python_ast::ExceptHandler::ExceptHandler(handler) = handler;
                    walk_suite(&handler.body, in_function, in_type_checking, out);
                }
                walk_suite(&try_stmt.orelse, in_function, in_type_checking, out);
                walk_suite(&try_stmt.finalbody, in_function, in_type_checking, out);
            }
            Stmt::With(with_stmt) => {
                walk_suite(&with_stmt.body, in_function, in_type_checking, out);
            }
            Stmt::While(while_stmt) => {
                walk_suite(&while_stmt.body, in_function, in_type_checking, out);
                walk_suite(&while_stmt.orelse, in_function, in_type_checking, out);
            }
            Stmt::For(for_stmt) => {
                walk_suite(&for_stmt.body, in_function, in_type_checking, out);
                walk_suite(&for_stmt.orelse, in_function, in_type_checking, out);
            }
            Stmt::Match(match_stmt) => {
                for case in &match_stmt.cases {
                    walk_suite(&case.body, in_function, in_type_checking, out);
                }
            }
            _ => {}
        }
    }
}

fn stmt_body(stmt: &Stmt) -> &[Stmt] {
    match stmt {
        Stmt::FunctionDef(def) => &def.body,
        _ => &[],
    }
}

/// Matches `if TYPE_CHECKING:` and `if typing.TYPE_CHECKING:`.
fn is_type_checking_test(test: &Expr) -> bool {
    match test {
        Expr::Name(name) => name.id.as_str() == "TYPE_CHECKING",
        Expr::Attribute(attr) => attr.attr.as_str() == "TYPE_CHECKING",
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one(source: &str) -> Vec<ImportStmt> {
        extract_imports_impl(source)
    }

    #[test]
    fn test_plain_import() {
        let stmts = one("import a.b.c\nimport d");
        assert_eq!(stmts.len(), 2);
        assert_eq!(stmts[0].module.as_deref(), Some("a.b.c"));
        assert_eq!(stmts[0].level, 0);
        assert!(stmts[0].names.is_empty());
        assert!(stmts[0].is_module_level);
        assert!(!stmts[0].in_type_checking);
        assert_eq!(stmts[1].module.as_deref(), Some("d"));
    }

    #[test]
    fn test_from_import() {
        let stmts = one("from a.b import c, d as e");
        assert_eq!(stmts.len(), 1);
        assert_eq!(stmts[0].module.as_deref(), Some("a.b"));
        assert_eq!(stmts[0].level, 0);
        assert_eq!(stmts[0].names, vec!["c".to_string(), "d".to_string()]);
    }

    #[test]
    fn test_relative_imports() {
        let stmts = one("from . import x\nfrom ..pkg import y\nfrom .sub import z");
        assert_eq!(stmts.len(), 3);
        assert_eq!(stmts[0].module, None);
        assert_eq!(stmts[0].level, 1);
        assert_eq!(stmts[0].names, vec!["x".to_string()]);
        assert_eq!(stmts[1].module.as_deref(), Some("pkg"));
        assert_eq!(stmts[1].level, 2);
        assert_eq!(stmts[2].module.as_deref(), Some("sub"));
        assert_eq!(stmts[2].level, 1);
    }

    #[test]
    fn test_function_level_imports_flagged() {
        let stmts = one("import top\ndef f():\n    import inner\n    async def g():\n        import deep");
        assert_eq!(stmts.len(), 3);
        assert!(stmts[0].is_module_level);
        assert!(!stmts[1].is_module_level);
        assert!(!stmts[2].is_module_level);
    }

    #[test]
    fn test_type_checking_block() {
        let stmts = one(
            "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    import typeshed_only\nimport runtime",
        );
        assert_eq!(stmts.len(), 3);
        assert!(!stmts[0].in_type_checking);
        assert!(stmts[1].in_type_checking);
        assert!(!stmts[2].in_type_checking);
    }

    #[test]
    fn test_typing_attribute_type_checking() {
        let stmts = one("import typing\nif typing.TYPE_CHECKING:\n    import t\nelse:\n    import r");
        assert_eq!(stmts.len(), 3);
        assert!(stmts[1].in_type_checking);
        assert!(!stmts[2].in_type_checking);
    }

    #[test]
    fn test_try_except_both_branches() {
        let stmts = one("try:\n    import orjson\nexcept ImportError:\n    import json\nfinally:\n    import cleanup_mod");
        assert_eq!(stmts.len(), 3);
        assert!(stmts.iter().all(|s| s.is_module_level));
    }

    #[test]
    fn test_class_body_executes_methods_do_not() {
        let stmts = one("class A:\n    import class_level\n    def m(self):\n        import method_level");
        assert_eq!(stmts.len(), 2);
        assert!(stmts[0].is_module_level);
        assert!(!stmts[1].is_module_level);
    }

    #[test]
    fn test_module_level_if_both_branches() {
        let stmts = one("import sys\nif sys.platform == 'win32':\n    import win\nelse:\n    import posix");
        assert_eq!(stmts.len(), 3);
        assert!(stmts.iter().all(|s| s.is_module_level));
        assert!(stmts.iter().all(|s| !s.in_type_checking));
    }

    #[test]
    fn test_invalid_syntax() {
        assert!(one("def broken(").is_empty());
    }

    #[test]
    fn test_match_statement() {
        let stmts = one("match x:\n    case 1:\n        import one_mod");
        assert_eq!(stmts.len(), 1);
        assert!(stmts[0].is_module_level);
    }
}
