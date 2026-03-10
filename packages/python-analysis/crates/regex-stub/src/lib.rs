//! Stubbed `regex` crate that delegates regex matching to the JS host
//! via WIT imports, eliminating regex-automata/regex-syntax tables from
//! the WASM binary.

use std::borrow::Cow;
use std::fmt;
use std::ops::Index;

use serde::Deserialize;

// ---------------------------------------------------------------------------
// Pattern translation: Rust regex -> JS RegExp (with `v` flag)
// ---------------------------------------------------------------------------

/// Translate a Rust `regex` pattern to JS `RegExp` syntax.
///
/// The JS side compiles the pattern with the `u` flag (Unicode mode),
/// which supports `\p{}` property escapes.
///
/// Conversions:
/// - `(?P<name>...)` -> `(?<name>...)` (named captures)
/// - `\w` / `\W` -> Unicode-aware word class via `\p{}` properties
/// - `\d` / `\D` -> `\p{Nd}` / `\P{Nd}`
/// - `\s` / `\S` -> `\p{White_Space}` / `\P{White_Space}`
/// - `\b` / `\B` -> Unicode-aware word boundary via lookarounds
/// - Bare `}` -> `\}` (lone `}` is a syntax error in JS unicode mode)
fn translate_pattern(pattern: &str) -> String {
    // Unicode word-character properties matching the Rust `regex` crate `\w`.
    const W: &str = r"\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control}";

    let b = pattern.as_bytes();
    let len = b.len();

    // Fast path: nothing to translate.
    if !pattern.contains('\\') && !pattern.contains("(?P<") && !pattern.contains('}') {
        return pattern.to_owned();
    }

    let mut out = String::with_capacity(pattern.len() + 32);
    let mut i = 0;
    // Track unescaped `{` to detect lone `}` that need escaping for JS unicode mode.
    let mut brace_depth: u32 = 0;
    // Track whether we're inside a character class `[...]` where `}` is literal.
    let mut in_char_class = false;

    while i < len {
        // Named group: (?P<name>...) -> (?<name>...)
        if b[i] == b'('
            && !in_char_class
            && i + 3 < len
            && b[i + 1] == b'?'
            && b[i + 2] == b'P'
            && b[i + 3] == b'<'
        {
            out.push_str("(?<");
            i += 4;
            continue;
        }

        // Backslash escape sequences
        if b[i] == b'\\' && i + 1 < len {
            match b[i + 1] {
                b'w' if !in_char_class => {
                    out.push('[');
                    out.push_str(W);
                    out.push(']');
                }
                b'W' if !in_char_class => {
                    out.push_str("[^");
                    out.push_str(W);
                    out.push(']');
                }
                b'd' if !in_char_class => out.push_str(r"\p{Nd}"),
                b'D' if !in_char_class => out.push_str(r"\P{Nd}"),
                b's' if !in_char_class => out.push_str(r"\p{White_Space}"),
                b'S' if !in_char_class => out.push_str(r"\P{White_Space}"),
                b'b' if !in_char_class => {
                    // Unicode word boundary: one side is word-char, other is not.
                    out.push_str("(?:(?<=[");
                    out.push_str(W);
                    out.push_str("])(?![");
                    out.push_str(W);
                    out.push_str("])|(?<![");
                    out.push_str(W);
                    out.push_str("])(?=[");
                    out.push_str(W);
                    out.push_str("]))");
                }
                b'B' if !in_char_class => {
                    // Unicode non-word boundary: both sides same category.
                    out.push_str("(?:(?<=[");
                    out.push_str(W);
                    out.push_str("])(?=[");
                    out.push_str(W);
                    out.push_str("])|(?<![");
                    out.push_str(W);
                    out.push_str("])(?![");
                    out.push_str(W);
                    out.push_str("]))");
                }
                other => {
                    out.push('\\');
                    out.push(other as char);
                }
            }
            i += 2;
            continue;
        }

        // Character class tracking
        if b[i] == b'[' && !in_char_class {
            in_char_class = true;
            out.push('[');
            i += 1;
            continue;
        }
        if b[i] == b']' && in_char_class {
            in_char_class = false;
            out.push(']');
            i += 1;
            continue;
        }

        // Brace tracking (outside character classes)
        if !in_char_class {
            if b[i] == b'{' {
                brace_depth += 1;
                out.push('{');
                i += 1;
                continue;
            }
            if b[i] == b'}' {
                if brace_depth > 0 {
                    brace_depth -= 1;
                    out.push('}');
                } else {
                    // Lone `}` — escape it for JS unicode mode
                    out.push_str("\\}");
                }
                i += 1;
                continue;
            }
        }

        // Regular character (possibly multi-byte UTF-8)
        let ch = pattern[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }

    out
}

// ---------------------------------------------------------------------------
// JSON schema returned by the host
// ---------------------------------------------------------------------------

/// A single match entry from the host.
/// `{"overall":[start,end],"groups":[[s,e],null,...],"named":{"group":[start,end],...}}`
#[derive(Deserialize)]
struct HostMatch {
    overall: [usize; 2],
    #[serde(default)]
    groups: Vec<Option<[usize; 2]>>,
    #[serde(default)]
    named: std::collections::HashMap<String, Option<[usize; 2]>>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// A compiled regular expression.
pub struct Regex {
    pattern: String,
}

impl Regex {
    /// Compile a new regex. Translates Rust named groups to JS syntax
    /// and validates the pattern on the JS host.
    pub fn new(pattern: &str) -> Result<Regex, Error> {
        let pattern = translate_pattern(pattern);
        host_bridge::regex_new(&pattern).map_err(|e| Error(e))?;
        Ok(Regex { pattern })
    }

    /// Replace all non-overlapping matches in `text` with the replacement
    /// provided by `rep`.
    pub fn replace_all<'t, R: Replacer>(&self, text: &'t str, mut rep: R) -> Cow<'t, str> {
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

    /// Find all captures by calling the host.
    fn find_all_captures<'t>(&self, text: &'t str) -> Vec<Captures<'t>> {
        let json = host_bridge::regex_find_all(&self.pattern, text);
        if json == "[]" {
            return Vec::new();
        }

        let host_matches: Vec<HostMatch> = match serde_json::from_str(&json) {
            Ok(m) => m,
            Err(e) => {
                debug_assert!(false, "regex-stub: failed to parse host JSON: {e}");
                return Vec::new();
            }
        };

        host_matches
            .into_iter()
            .map(|hm| Captures {
                text,
                overall: hm.overall,
                groups: hm.groups,
                named: hm.named,
            })
            .collect()
    }
}

/// A set of captures for a single match.
pub struct Captures<'t> {
    text: &'t str,
    overall: [usize; 2],
    groups: Vec<Option<[usize; 2]>>,
    named: std::collections::HashMap<String, Option<[usize; 2]>>,
}

impl<'t> Captures<'t> {
    /// Get a named capture group.
    pub fn name(&self, name: &str) -> Option<Match<'t>> {
        self.named.get(name).and_then(|span| {
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
            .unwrap_or_else(|| panic!("no capture group named '{name}'"))
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
            self.text.is_char_boundary(self.start) && self.text.is_char_boundary(self.end),
            "regex-stub: host returned byte offsets ({}, {}) that are not valid \
             UTF-8 char boundaries in text of len {}",
            self.start, self.end, self.text.len(),
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

/// A regex error.
#[derive(Debug)]
pub struct Error(String);

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "regex error: {}", self.0)
    }
}

impl std::error::Error for Error {}

/// Trait for types that can be used as replacements in `replace_all`.
pub trait Replacer {
    /// Append the replacement for `caps` to `dst`.
    fn replace_append(&mut self, caps: &Captures<'_>, dst: &mut String);
}

impl<F> Replacer for F
where
    F: FnMut(&Captures<'_>) -> String,
{
    fn replace_append(&mut self, caps: &Captures<'_>, dst: &mut String) {
        dst.push_str(&self(caps));
    }
}

impl Replacer for &str {
    fn replace_append(&mut self, caps: &Captures<'_>, dst: &mut String) {
        expand_str(self, caps, dst);
    }
}

impl Replacer for String {
    fn replace_append(&mut self, caps: &Captures<'_>, dst: &mut String) {
        expand_str(self, caps, dst);
    }
}

/// Expand `$`-references in a replacement string, matching the `regex` crate
/// semantics: `$0` or `${0}` for the overall match, `$1`/`${1}` for positional
/// groups, `$name`/`${name}` for named groups, and `$$` for a literal `$`.
fn expand_str(replacement: &str, caps: &Captures<'_>, dst: &mut String) {
    let mut chars = replacement.chars().peekable();
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
                let mut ref_name = String::new();
                for ch in chars.by_ref() {
                    if ch == '}' {
                        break;
                    }
                    ref_name.push(ch);
                }
                append_capture_ref(&ref_name, caps, dst);
            }
            // $name or $0-9...
            Some(&ch) if ch.is_ascii_alphanumeric() || ch == '_' => {
                chars.next();
                let mut ref_name = String::new();
                ref_name.push(ch);
                while let Some(&ch) = chars.peek() {
                    if ch.is_ascii_alphanumeric() || ch == '_' {
                        ref_name.push(ch);
                        chars.next();
                    } else {
                        break;
                    }
                }
                append_capture_ref(&ref_name, caps, dst);
            }
            // Bare $ at end or before non-identifier char -> literal $
            _ => {
                dst.push('$');
            }
        }
    }
}

/// Resolve a capture reference (numeric index or group name) and append
/// the matched text to `dst`.
fn append_capture_ref(reference: &str, caps: &Captures<'_>, dst: &mut String) {
    if let Ok(i) = reference.parse::<usize>() {
        if let Some(m) = caps.get(i) {
            dst.push_str(m.as_str());
        }
    } else if let Some(m) = caps.name(reference) {
        dst.push_str(m.as_str());
    }
    // If the reference doesn't match anything, the real `regex` crate
    // appends nothing -- same behavior here.
}
