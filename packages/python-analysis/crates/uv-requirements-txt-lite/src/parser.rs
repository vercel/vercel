//! Synchronous requirements.txt parser extracted from uv-requirements-txt.
//!
//! Differences from upstream:
//! - No async code; content is passed as `&str`
//! - No `uv-client` (HTTP fetching) -- TS handles file I/O
//! - No `uv-configuration` -- `--no-binary`/`--only-binary` stored as raw strings
//! - No `uv-distribution-types` -- no `From<RequirementEntry>` conversion
//! - No `uv-warnings` -- unsupported options silently skipped
//! - No `uv_fs::Simplified` -- use `.display()` instead
//! - Index URLs stored as raw strings (no `VerbatimUrl`, no filesystem checks)
//! - No `#[instrument]` tracing decorations
//! - No `RequirementsTxt` aggregation struct (recursion handled in TS)

use std::borrow::Cow;
use std::fmt::{Display, Formatter};
use std::path::Path;

use unscanny::{Pattern, Scanner};

use uv_pep508::{Pep508Error, VerbatimUrl, expand_env_vars};

use crate::shquote::unquote;

/// We emit one of these for each `requirements.txt` entry.
pub(crate) enum RequirementsTxtStatement {
    /// `-r` inclusion filename
    Requirements { filename: String },
    /// `-c` inclusion filename
    Constraint { filename: String },
    /// PEP 508 requirement plus metadata
    RequirementEntry(RequirementEntry),
    /// `-e`
    EditableRequirementEntry(RequirementEntry),
    /// `--index-url`
    IndexUrl(String),
    /// `--extra-index-url`
    ExtraIndexUrl(String),
    /// `--find-links`
    FindLinks(String),
    /// `--no-index`
    NoIndex,
    /// `--no-binary` (value parsed and discarded)
    NoBinary,
    /// `--only-binary` (value parsed and discarded)
    OnlyBinary,
    /// An unsupported option (silently skipped)
    UnsupportedOption,
}

/// A requirement entry with optional hashes.
#[derive(Debug, Clone)]
pub(crate) struct RequirementEntry {
    /// The actual PEP 508 requirement.
    pub requirement: RequirementsTxtRequirement,
    /// Hashes of the downloadable packages.
    pub hashes: Vec<String>,
}

/// A requirement specifier in a `requirements.txt` file.
#[derive(Debug, Clone)]
pub(crate) enum RequirementsTxtRequirement {
    /// A named PEP 508 requirement.
    Named(uv_pep508::Requirement<VerbatimUrl>),
    /// A PEP 508-like, direct URL dependency specifier (unnamed).
    Unnamed(uv_pep508::UnnamedRequirement<VerbatimUrl>),
}

impl RequirementsTxtRequirement {
    /// Parse a requirement as seen in a `requirements.txt` file.
    pub fn parse(
        input: &str,
        working_dir: impl AsRef<Path>,
        editable: bool,
    ) -> Result<Self, Box<Pep508Error<VerbatimUrl>>> {
        // Attempt to parse as a PEP 508-compliant requirement.
        match uv_pep508::Requirement::parse(input, &working_dir) {
            Ok(requirement) => {
                if editable && requirement.version_or_url.is_none() {
                    Ok(Self::Unnamed(uv_pep508::UnnamedRequirement::parse(
                        input,
                        &working_dir,
                        &mut uv_pep508::TracingReporter,
                    )?))
                } else {
                    Ok(Self::Named(requirement))
                }
            }
            Err(err) => match err.message {
                uv_pep508::Pep508ErrorSource::UnsupportedRequirement(_) => {
                    Ok(Self::Unnamed(uv_pep508::UnnamedRequirement::parse(
                        input,
                        &working_dir,
                        &mut uv_pep508::TracingReporter,
                    )?))
                }
                _ => Err(err),
            },
        }
        .map_err(Box::new)
    }
}

impl Display for RequirementsTxtRequirement {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Named(requirement) => Display::fmt(&requirement, f),
            Self::Unnamed(requirement) => Display::fmt(&requirement, f),
        }
    }
}

/// Unsupported options that we skip silently.
const UNSUPPORTED_OPTIONS: &[&str] = &[
    "--prefer-binary",
    "--require-hashes",
    "--pre",
    "--trusted-host",
    "--use-feature",
];

/// Returns `true` if the character is a newline or a comment character.
const fn is_terminal(c: char) -> bool {
    matches!(c, '\n' | '\r' | '#')
}

/// Parse a single entry from requirements.txt.
///
/// Consumes all preceding trivia (whitespace and comments). Returns `None` at EOF.
pub(crate) fn parse_entry(
    s: &mut Scanner,
    content: &str,
    working_dir: &Path,
) -> Result<Option<RequirementsTxtStatement>, RequirementsTxtParserError> {
    // Eat all preceding whitespace, this may run us to the end of file
    eat_wrappable_whitespace(s);
    while s.at(['\n', '\r', '#']) {
        // skip comments
        eat_trailing_line(content, s)?;
        eat_wrappable_whitespace(s);
    }

    let _start = s.cursor();
    Ok(Some(if s.eat_if("-r") || s.eat_if("--requirement") {
        let filename = parse_value("--requirement", content, s, |c: char| !is_terminal(c))?;
        let filename = unquote(filename)
            .ok()
            .flatten()
            .unwrap_or_else(|| filename.to_string());
        RequirementsTxtStatement::Requirements { filename }
    } else if s.eat_if("-c") || s.eat_if("--constraint") {
        let filename = parse_value("--constraint", content, s, |c: char| !is_terminal(c))?;
        let filename = unquote(filename)
            .ok()
            .flatten()
            .unwrap_or_else(|| filename.to_string());
        RequirementsTxtStatement::Constraint { filename }
    } else if s.eat_if("-e") || s.eat_if("--editable") {
        if s.eat_if('=') {
            // Explicit equals sign.
        } else if s.eat_if(char::is_whitespace) {
            // Key and value are separated by whitespace instead.
            s.eat_whitespace();
        } else {
            let (line, column) = calculate_row_column(content, s.cursor());
            return Err(RequirementsTxtParserError::Parser {
                message: format!("Expected '=' or whitespace, found {:?}", s.peek()),
                line,
                column,
            });
        }

        let (requirement, hashes) = parse_requirement_and_hashes(s, content, working_dir, true)?;
        RequirementsTxtStatement::EditableRequirementEntry(RequirementEntry {
            requirement,
            hashes,
        })
    } else if s.eat_if("-i") || s.eat_if("--index-url") {
        let given = parse_value("--index-url", content, s, |c: char| !is_terminal(c))?;
        let given = unquote(given)
            .ok()
            .flatten()
            .map(Cow::Owned)
            .unwrap_or(Cow::Borrowed(given));
        let expanded = expand_env_vars(given.as_ref());
        RequirementsTxtStatement::IndexUrl(expanded.into_owned())
    } else if s.eat_if("--extra-index-url") {
        let given = parse_value("--extra-index-url", content, s, |c: char| !is_terminal(c))?;
        let given = unquote(given)
            .ok()
            .flatten()
            .map(Cow::Owned)
            .unwrap_or(Cow::Borrowed(given));
        let expanded = expand_env_vars(given.as_ref());
        RequirementsTxtStatement::ExtraIndexUrl(expanded.into_owned())
    } else if s.eat_if("--no-index") {
        RequirementsTxtStatement::NoIndex
    } else if s.eat_if("--find-links") || s.eat_if("-f") {
        let given = parse_value("--find-links", content, s, |c: char| !is_terminal(c))?;
        let given = unquote(given)
            .ok()
            .flatten()
            .map(Cow::Owned)
            .unwrap_or(Cow::Borrowed(given));
        let expanded = expand_env_vars(given.as_ref());
        RequirementsTxtStatement::FindLinks(expanded.into_owned())
    } else if s.eat_if("--no-binary") {
        // Parse and discard the value
        let _given = parse_value("--no-binary", content, s, |c: char| !is_terminal(c))?;
        RequirementsTxtStatement::NoBinary
    } else if s.eat_if("--only-binary") {
        // Parse and discard the value
        let _given = parse_value("--only-binary", content, s, |c: char| !is_terminal(c))?;
        RequirementsTxtStatement::OnlyBinary
    } else if s.at(char::is_ascii_alphanumeric) || s.at(|c| matches!(c, '.' | '/' | '$')) {
        let (requirement, hashes) = parse_requirement_and_hashes(s, content, working_dir, false)?;
        RequirementsTxtStatement::RequirementEntry(RequirementEntry {
            requirement,
            hashes,
        })
    } else if let Some(_char) = s.peek() {
        // Identify an unsupported option
        if UNSUPPORTED_OPTIONS.iter().any(|opt| s.eat_if(*opt)) {
            s.eat_while(|c: char| !is_terminal(c));
            RequirementsTxtStatement::UnsupportedOption
        } else {
            let (line, column) = calculate_row_column(content, s.cursor());
            return Err(RequirementsTxtParserError::Parser {
                message: format!(
                    "Unexpected '{_char}', expected '-c', '-e', '-r' or the start of a requirement"
                ),
                line,
                column,
            });
        }
    } else {
        // EOF
        return Ok(None);
    }))
}

/// Eat whitespace and ignore newlines escaped with a backslash.
fn eat_wrappable_whitespace<'a>(s: &mut Scanner<'a>) -> &'a str {
    let start = s.cursor();
    s.eat_while([' ', '\t']);
    while s.eat_if("\\\n") || s.eat_if("\\\r\n") || s.eat_if("\\\r") {
        s.eat_while([' ', '\t']);
    }
    s.from(start)
}

/// Eats the end of line or a potential trailing comment.
fn eat_trailing_line(content: &str, s: &mut Scanner) -> Result<(), RequirementsTxtParserError> {
    s.eat_while([' ', '\t']);
    match s.eat() {
        None | Some('\n') => {}
        Some('\r') => {
            s.eat_if('\n');
        }
        Some('#') => {
            s.eat_until(['\r', '\n']);
            if s.at('\r') {
                s.eat_if('\n');
            }
        }
        Some(other) => {
            let (line, column) = calculate_row_column(content, s.cursor());
            return Err(RequirementsTxtParserError::Parser {
                message: format!("Expected comment or end-of-line, found `{other}`"),
                line,
                column,
            });
        }
    }
    Ok(())
}

/// Parse a PEP 508 requirement with optional trailing hashes.
fn parse_requirement_and_hashes(
    s: &mut Scanner,
    content: &str,
    working_dir: &Path,
    editable: bool,
) -> Result<(RequirementsTxtRequirement, Vec<String>), RequirementsTxtParserError> {
    let start = s.cursor();
    let (end, has_hashes) = loop {
        let end = s.cursor();

        if s.eat_if('\n') {
            break (end, false);
        }
        if s.eat_if('\r') {
            s.eat_if('\n');
            break (end, false);
        }
        if !eat_wrappable_whitespace(s).is_empty() {
            if s.after().starts_with("--") {
                break (end, true);
            } else if s.eat_if('#') {
                s.eat_until(['\r', '\n']);
                if s.at('\r') {
                    s.eat_if('\n');
                }
                break (end, false);
            }
            continue;
        }
        if s.eat().is_none() {
            break (end, false);
        }
    };

    let requirement = &content[start..end];

    let requirement = RequirementsTxtRequirement::parse(requirement, working_dir, editable)
        .map_err(|err| RequirementsTxtParserError::Pep508 {
            source: err,
            start,
            end,
        })?;

    let hashes = if has_hashes {
        parse_hashes(content, s)?
    } else {
        Vec::new()
    };
    Ok((requirement, hashes))
}

/// Parse `--hash=... --hash ...` after a requirement.
fn parse_hashes(content: &str, s: &mut Scanner) -> Result<Vec<String>, RequirementsTxtParserError> {
    let mut hashes = Vec::new();
    if s.eat_while("--hash").is_empty() {
        let (line, column) = calculate_row_column(content, s.cursor());
        return Err(RequirementsTxtParserError::Parser {
            message: format!(
                "Expected `--hash`, found `{:?}`",
                s.eat_while(|c: char| !c.is_whitespace())
            ),
            line,
            column,
        });
    }
    let hash = parse_value("--hash", content, s, |c: char| !c.is_whitespace())?;
    hashes.push(hash.to_string());
    loop {
        eat_wrappable_whitespace(s);
        if !s.eat_if("--hash") {
            break;
        }
        let hash = parse_value("--hash", content, s, |c: char| !c.is_whitespace())?;
        hashes.push(hash.to_string());
    }
    Ok(hashes)
}

/// In `-<key>=<value>` or `-<key> value`, parse the part after the key.
fn parse_value<'a, T>(
    option: &str,
    content: &str,
    s: &mut Scanner<'a>,
    while_pattern: impl Pattern<T>,
) -> Result<&'a str, RequirementsTxtParserError> {
    let value = if s.eat_if('=') {
        s.eat_while(while_pattern).trim_end()
    } else if s.eat_if(char::is_whitespace) {
        s.eat_whitespace();
        s.eat_while(while_pattern).trim_end()
    } else {
        let (line, column) = calculate_row_column(content, s.cursor());
        return Err(RequirementsTxtParserError::Parser {
            message: format!("Expected '=' or whitespace, found {:?}", s.peek()),
            line,
            column,
        });
    };

    if value.is_empty() {
        let (line, column) = calculate_row_column(content, s.cursor());
        return Err(RequirementsTxtParserError::Parser {
            message: format!("`{option}` must be followed by an argument"),
            line,
            column,
        });
    }

    Ok(value)
}

/// Calculate the 1-based row and column from a byte offset.
pub(crate) fn calculate_row_column(content: &str, position: usize) -> (usize, usize) {
    let mut line = 1;
    let mut column = 1;
    for (i, c) in content.char_indices() {
        if i >= position {
            break;
        }
        if c == '\n' {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }
    (line, column)
}

/// Error parsing requirements.txt.
#[derive(Debug, thiserror::Error)]
pub enum RequirementsTxtParserError {
    #[error("Parser error at line {line}, column {column}: {message}")]
    Parser {
        message: String,
        line: usize,
        column: usize,
    },
    #[error("PEP 508 error at positions {start}..{end}: {source}")]
    Pep508 {
        source: Box<Pep508Error<VerbatimUrl>>,
        start: usize,
        end: usize,
    },
}
