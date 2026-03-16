// Derived from the regex crate (https://github.com/rust-lang/regex).
// Copyright (c) The Rust Project Developers.
// Licensed under the Apache License, Version 2.0 or the MIT License.

//! Stubbed `regex` crate that delegates regex matching to the JS host
//! via WIT imports, eliminating regex-automata/regex-syntax tables from
//! the WASM binary.

mod translate;

use std::borrow::Cow;
use std::fmt;
use std::ops::Index;

use regex_syntax::ast::parse::Parser as AstParser;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Convert a host-bridge span to a `[start, end]` pair.
fn span_pair(s: host_bridge::RegexSpan) -> [usize; 2] {
    [s.start as usize, s.end as usize]
}

/// A compiled regular expression.
pub struct Regex {
    /// The JS-compatible pattern source (translated from Rust
    /// syntax).
    pattern: String,
    /// JS RegExp constructor flags extracted from the pattern
    /// (e.g. `"im"`).  Does not include the always-present `g`,
    /// `d`, `v` flags.
    flags: String,
}

/// A configurable builder for a `Regex`.
///
/// Mirrors the upstream `regex::RegexBuilder` API surface needed by
/// tests and callers.  Unsupported configurations (non-Unicode mode,
/// custom line terminators, etc.) are rejected at `build()` time so
/// the error flows through the normal `Result` path.
pub struct RegexBuilder {
    pattern: String,
    case_insensitive: bool,
    unicode: bool,
    line_terminator: u8,
}

impl RegexBuilder {
    /// Create a new builder for the given pattern.
    pub fn new(pattern: &str) -> RegexBuilder {
        RegexBuilder {
            pattern: pattern.to_owned(),
            case_insensitive: false,
            unicode: true,
            line_terminator: b'\n',
        }
    }

    /// Set case-insensitive matching.
    pub fn case_insensitive(
        &mut self,
        yes: bool,
    ) -> &mut RegexBuilder {
        self.case_insensitive = yes;
        self
    }

    /// Set Unicode mode.  The JS backend only supports Unicode mode;
    /// passing `false` will cause `build()` to return an error.
    pub fn unicode(
        &mut self,
        yes: bool,
    ) -> &mut RegexBuilder {
        self.unicode = yes;
        self
    }

    /// Set the line terminator byte used by `(?m:^)` and `(?m:$)`.
    /// The JS backend only supports the default `\n`; any other
    /// value causes `build()` to return an error.
    pub fn line_terminator(
        &mut self,
        byte: u8,
    ) -> &mut RegexBuilder {
        self.line_terminator = byte;
        self
    }

    /// Compile the regex, applying all configured options.
    pub fn build(&self) -> Result<Regex, Error> {
        if !self.unicode {
            return Err(Error::unsupported(
                "non-Unicode mode is not supported by the \
                 JS regex backend",
            ));
        }
        if self.line_terminator != b'\n' {
            return Err(Error::unsupported(
                "custom line terminator is not supported by \
                 the JS regex backend -- JS RegExp always \
                 uses \\n",
            ));
        }

        if self.case_insensitive {
            Regex::new(&format!("(?i){}", self.pattern))
        } else {
            Regex::new(&self.pattern)
        }
    }
}

impl Regex {
    /// Compile a new regex. Parses the Rust regex pattern into an
    /// AST, validates it, translates to JS syntax, and validates
    /// via the JS host.
    pub fn new(pattern: &str) -> Result<Regex, Error> {
        let ast = AstParser::new()
            .parse(pattern)
            .map_err(|e| Error(e.to_string()))?;
        let (source, mut flags) =
            translate::emit_to_js(&ast)?;
        // Always include g (global), d (hasIndices),
        // v (unicodeSets).
        flags.push_str("gdv");
        host_bridge::regex_new(&source, &flags)
            .map_err(Error)?;
        Ok(Regex {
            pattern: source,
            flags,
        })
    }

    /// Replace all non-overlapping matches in `text` with the
    /// replacement provided by `rep`.
    pub fn replace_all<'t, R: Replacer>(
        &self,
        text: &'t str,
        mut rep: R,
    ) -> Cow<'t, str> {
        let captures = self.find_all_captures(text);
        if captures.is_empty() {
            return Cow::Borrowed(text);
        }

        let mut result = String::with_capacity(text.len());
        let mut last_end = 0;

        for cap in &captures {
            let [start, end] = cap.overall;
            result.push_str(&text[last_end..start]);
            rep.replace_append(cap, &mut result);
            last_end = end;
        }

        result.push_str(&text[last_end..]);
        Cow::Owned(result)
    }

    /// Return an iterator over all non-overlapping matches in
    /// `haystack`.
    pub fn find_iter<'t>(
        &self,
        haystack: &'t str,
    ) -> MatchIter<'t> {
        let spans: Vec<[usize; 2]> = self
            .find_all_raw(haystack)
            .into_iter()
            .map(|hm| span_pair(hm.overall))
            .collect();
        MatchIter {
            haystack,
            spans,
            pos: 0,
        }
    }

    /// Call the host and return raw match data.
    fn find_all_raw(
        &self,
        text: &str,
    ) -> Vec<host_bridge::RegexMatch> {
        host_bridge::regex_find_all(
            &self.pattern,
            &self.flags,
            text,
        )
    }

    /// Find all captures by calling the host.
    fn find_all_captures<'t>(
        &self,
        text: &'t str,
    ) -> Vec<Captures<'t>> {
        self.find_all_raw(text)
            .into_iter()
            .map(|hm| Captures::from_host_match(hm, text))
            .collect()
    }
}

/// A set of captures for a single match.
pub struct Captures<'t> {
    text: &'t str,
    overall: [usize; 2],
    groups: Vec<Option<[usize; 2]>>,
    named: Vec<(String, Option<[usize; 2]>)>,
}

impl Captures<'_> {
    fn from_host_match(
        hm: host_bridge::RegexMatch,
        text: &str,
    ) -> Captures<'_> {
        let overall = span_pair(hm.overall);
        let groups = hm
            .groups
            .into_iter()
            .map(|sp| sp.map(span_pair))
            .collect();
        let named = hm
            .named
            .into_iter()
            .map(|ng| (ng.name, ng.span.map(span_pair)))
            .collect();
        Captures {
            text,
            overall,
            groups,
            named,
        }
    }
}

impl<'t> Captures<'t> {
    /// Get a named capture group.
    pub fn name(&self, name: &str) -> Option<Match<'t>> {
        self.named
            .iter()
            .find(|(n, _)| n == name)
            .and_then(|(_, span)| {
                let [start, end] = (*span)?;
                Some(Match {
                    text: self.text,
                    start,
                    end,
                })
            })
    }

    /// Get a capture group by index. Index 0 is the overall match.
    pub fn get(&self, i: usize) -> Option<Match<'t>> {
        if i == 0 {
            Some(Match {
                text: self.text,
                start: self.overall[0],
                end: self.overall[1],
            })
        } else {
            self.groups.get(i - 1).and_then(|span| {
                let [start, end] = (*span)?;
                Some(Match {
                    text: self.text,
                    start,
                    end,
                })
            })
        }
    }
}

impl<'t> Index<&str> for Captures<'t> {
    type Output = str;

    fn index(&self, name: &str) -> &str {
        self.name(name)
            .unwrap_or_else(|| {
                panic!("no capture group named '{name}'")
            })
            .as_str()
    }
}

/// A single match within text.
#[derive(Copy, Clone)]
pub struct Match<'t> {
    text: &'t str,
    start: usize,
    end: usize,
}

impl<'t> Match<'t> {
    /// The matched text.
    pub fn as_str(&self) -> &'t str {
        assert!(
            self.text.is_char_boundary(self.start)
                && self.text.is_char_boundary(self.end),
            "regex-stub: host returned byte offsets ({}, {}) \
             that are not valid UTF-8 char boundaries in \
             text of len {}",
            self.start,
            self.end,
            self.text.len(),
        );
        &self.text[self.start..self.end]
    }

    /// The start byte offset.
    pub fn start(&self) -> usize {
        self.start
    }

    /// The end byte offset.
    pub fn end(&self) -> usize {
        self.end
    }
}

/// Iterator over non-overlapping matches returned by
/// [`Regex::find_iter`].
pub struct MatchIter<'t> {
    haystack: &'t str,
    spans: Vec<[usize; 2]>,
    pos: usize,
}

impl<'t> Iterator for MatchIter<'t> {
    type Item = Match<'t>;

    fn next(&mut self) -> Option<Self::Item> {
        let span = self.spans.get(self.pos)?;
        self.pos += 1;
        Some(Match {
            text: self.haystack,
            start: span[0],
            end: span[1],
        })
    }
}

/// A regex error.
#[derive(Debug)]
pub struct Error(String);

impl Error {
    /// Create an error for an unsupported feature.
    pub fn unsupported(msg: &str) -> Error {
        Error(msg.to_owned())
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "regex error: {}", self.0)
    }
}

impl std::error::Error for Error {}

/// Trait for types that can be used as replacements in
/// `replace_all`.
pub trait Replacer {
    /// Append the replacement for `caps` to `dst`.
    fn replace_append(
        &mut self,
        caps: &Captures<'_>,
        dst: &mut String,
    );
}

impl<F> Replacer for F
where
    F: FnMut(&Captures<'_>) -> String,
{
    fn replace_append(
        &mut self,
        caps: &Captures<'_>,
        dst: &mut String,
    ) {
        dst.push_str(&self(caps));
    }
}

impl Replacer for &str {
    fn replace_append(
        &mut self,
        caps: &Captures<'_>,
        dst: &mut String,
    ) {
        expand_str(self, caps, dst);
    }
}

impl Replacer for String {
    fn replace_append(
        &mut self,
        caps: &Captures<'_>,
        dst: &mut String,
    ) {
        expand_str(self, caps, dst);
    }
}

/// Expand `$`-references in a replacement string, matching the
/// `regex` crate semantics: `$0` or `${0}` for the overall match,
/// `$1`/`${1}` for positional groups, `$name`/`${name}` for named
/// groups, and `$$` for a literal `$`.
fn expand_str(
    replacement: &str,
    caps: &Captures<'_>,
    dst: &mut String,
) {
    let mut chars = replacement.chars().peekable();
    let mut ref_buf = String::new();
    while let Some(c) = chars.next() {
        if c != '$' {
            dst.push(c);
            continue;
        }
        match chars.peek() {
            // $$ -> literal $
            Some(&'$') => {
                chars.next();
                dst.push('$');
            }
            // ${...} -> braced reference
            Some(&'{') => {
                chars.next();
                ref_buf.clear();
                for ch in chars.by_ref() {
                    if ch == '}' {
                        break;
                    }
                    ref_buf.push(ch);
                }
                append_capture_ref(&ref_buf, caps, dst);
            }
            // $name or $0-9...
            Some(&ch)
                if ch.is_ascii_alphanumeric() || ch == '_' =>
            {
                chars.next();
                ref_buf.clear();
                ref_buf.push(ch);
                while let Some(&ch) = chars.peek() {
                    if ch.is_ascii_alphanumeric()
                        || ch == '_'
                    {
                        ref_buf.push(ch);
                        chars.next();
                    } else {
                        break;
                    }
                }
                append_capture_ref(&ref_buf, caps, dst);
            }
            // Bare $ at end or before non-identifier char ->
            // literal $
            _ => {
                dst.push('$');
            }
        }
    }
}

/// Resolve a capture reference (numeric index or group name) and
/// append the matched text to `dst`.
fn append_capture_ref(
    reference: &str,
    caps: &Captures<'_>,
    dst: &mut String,
) {
    if let Ok(i) = reference.parse::<usize>() {
        if let Some(m) = caps.get(i) {
            dst.push_str(m.as_str());
        }
    } else if let Some(m) = caps.name(reference) {
        dst.push_str(m.as_str());
    }
    // If the reference doesn't match anything, the upstream `regex`
    // crate appends nothing -- same behavior here.
}
