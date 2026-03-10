use core::fmt;

/// A stub name type that is never constructed.
pub struct Name;

impl Name {
    pub fn as_str(&self) -> &str {
        ""
    }
}

impl fmt::Display for Name {
    fn fmt(&self, _f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Ok(())
    }
}

/// Stub: always returns `None`.
pub fn name(_c: char) -> Option<Name> {
    None
}

/// Stub: always returns the Unicode replacement character.
/// Returning `None` would cause the ruff parser to emit an error and
/// potentially abort, so we return a placeholder instead.  The actual
/// character value is irrelevant for dependency/entrypoint analysis.
pub fn character(_name: &str) -> Option<char> {
    Some('\u{FFFD}')
}
