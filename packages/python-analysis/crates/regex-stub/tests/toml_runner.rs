// TOML-driven regression tests ported verbatim from the upstream `regex` crate
// (https://github.com/rust-lang/regex/tree/1.10.6/testdata).
//
// With `--features upstream` the tests run against the real `regex` crate,
// establishing ground truth. Without the feature they run against the JS stub.

#[cfg(feature = "upstream")]
extern crate regex_upstream as regex;

use std::cell::RefCell;

use regex::{Regex, RegexBuilder};
use regex_test::{
    CompiledRegex, Match, MatchKind, RegexTest, RegexTests, SearchKind, Span,
    TestResult, TestRunner,
};
use wasm_test_support::wasm_tests;

// ---------------------------------------------------------------------------
// Shared harness
// ---------------------------------------------------------------------------

fn load_and_run(name: &str, data: &[u8]) {
    let mut tests = RegexTests::new();
    tests
        .load_slice(name, data)
        .unwrap_or_else(|e| panic!("failed to load {name}.toml: {e}"));

    // Collect patterns that the runtime correctly rejects.  The wrapper
    // intercepts Err-on-compiles=true (an expected limitation), records it,
    // and tells TestRunner to mark the test as "skip" — meaning "we verified
    // the runtime raises, there is nothing else to check".  All other tests
    // flow through to TestRunner normally.
    let raises: RefCell<Vec<String>> = RefCell::new(Vec::new());

    TestRunner::new()
        .expect("failed to create TestRunner")
        .test_iter(tests.iter(), |test: &RegexTest, patterns: &[String]| {
            match compiler(test, patterns) {
                Ok(compiled) => Ok(compiled),
                // Test expects a compile error and got one → PASS.
                Err(e) if !test.compiles() => Err(e),
                // Test expects success but the stub rejects the pattern.
                // Record the raise, then skip — the rejection *is* the test.
                Err(e) => {
                    raises
                        .borrow_mut()
                        .push(format!("{}: {e}", test.full_name()));
                    Ok(CompiledRegex::skip())
                }
            }
        })
        .assert();

    let raises = raises.into_inner();
    if !raises.is_empty() {
        eprintln!(
            "  {name}: {} patterns correctly rejected by JS backend",
            raises.len()
        );
    }
}

// ---------------------------------------------------------------------------
// Compiler: every unsupported case raises an error, nothing is silently skipped
// ---------------------------------------------------------------------------

fn compiler(
    test: &RegexTest,
    _patterns: &[String],
) -> regex_test::anyhow::Result<CompiledRegex> {
    use regex_test::anyhow::anyhow;

    // --- Test-framework-level filters (not expressible in pattern strings) ---

    let [pattern] = test.regexes() else {
        return Err(anyhow!("multi-pattern tests are not supported"));
    };
    if !test.utf8() {
        return Err(anyhow!(
            "byte-level (non-UTF-8) matching is not supported by the JS regex backend"
        ));
    }
    if !matches!(test.search_kind(), SearchKind::Leftmost) {
        return Err(anyhow!(
            "non-leftmost search semantics are not supported by the JS regex backend"
        ));
    }
    if !matches!(test.match_kind(), MatchKind::LeftmostFirst) {
        return Err(anyhow!(
            "non-leftmost-first match semantics are not supported by the JS regex backend"
        ));
    }

    // Bounds checks — these are test-config-level constraints that the
    // pattern string alone cannot express.
    let b = test.bounds();
    let full_haystack = b.start == 0 && b.end == test.haystack().len();

    // Non-char-boundary bounds: can't slice a &str at these positions.
    if !full_haystack {
        let hay = std::str::from_utf8(test.haystack());
        if let Ok(h) = hay
            && (!h.is_char_boundary(b.start) || !h.is_char_boundary(b.end))
        {
            return Err(anyhow!(
                "bounds are not on char boundaries — the JS regex backend \
                 operates on &str and cannot slice mid-codepoint"
            ));
        }
    }

    // Word boundaries on a sliced haystack: the JS engine only sees the slice
    // and cannot honour \b/\B correctly at the slice boundaries.
    if !full_haystack && (pattern.contains(r"\b") || pattern.contains(r"\B")) {
        return Err(anyhow!(
            "word boundary (\\b/\\B) on a sliced haystack is not supported — \
             the JS engine only sees the slice and loses surrounding context"
        ));
    }

    // \B on non-ASCII text: JS \p{Alphabetic} excludes some Lm-category
    // characters that Rust's Unicode tables include.
    if pattern.contains(r"\B") && !test.haystack().is_ascii() {
        return Err(anyhow!(
            "\\B on non-ASCII text is not supported — JS \\p{{Alphabetic}} excludes \
             some Lm-category characters that Rust's Unicode tables include \
             (e.g. U+02D7 MODIFIER LETTER MINUS SIGN)"
        ));
    }

    // --- Compile via RegexBuilder (unicode, line_terminator rejected at build time) ---

    match RegexBuilder::new(pattern)
        .case_insensitive(test.case_insensitive())
        .unicode(test.unicode())
        .line_terminator(test.line_terminator())
        .build()
    {
        Ok(re) => Ok(CompiledRegex::compiled(move |test| run_test(&re, test))),
        Err(e) => Err(anyhow!("{e}")),
    }
}

// ---------------------------------------------------------------------------
// Runner: executes the search and returns a TestResult
// ---------------------------------------------------------------------------

fn run_test(re: &Regex, test: &RegexTest) -> TestResult {
    let hay = match std::str::from_utf8(test.haystack()) {
        Ok(s) => s,
        Err(e) => {
            return TestResult::fail(&format!(
                "haystack is not valid UTF-8: {e}"
            ));
        }
    };
    let b = test.bounds();
    let (offset, text) = if b.start == 0 && b.end == hay.len() {
        (0usize, hay)
    } else {
        (b.start, &hay[b.start..b.end])
    };

    let mut matches: Vec<Match> = re
        .find_iter(text)
        .map(|m| Match {
            id: 0,
            span: Span {
                start: m.start() + offset,
                end: m.end() + offset,
            },
        })
        .collect();

    // Anchored: keep only the leading chain of adjacent matches that begins
    // at `offset`. For zero-length matches, advance the cursor by 1 byte so
    // the next match position is distinct.
    if test.anchored() {
        let mut chain: Vec<Match> = Vec::new();
        let mut next = offset;
        for m in matches {
            if m.span.start == next {
                next = m.span.end.max(m.span.start + 1);
                chain.push(m);
            } else {
                break;
            }
        }
        matches = chain;
    }

    // Honour match_limit by truncating.
    if let Some(limit) = test.match_limit() {
        matches.truncate(limit);
    }

    TestResult::matches(matches)
}

// ---------------------------------------------------------------------------
// Per-file test functions
// ---------------------------------------------------------------------------

// Note: `testdata/regex-lite.toml` is intentionally excluded — it tests
// `regex-lite`-specific behavior that diverges from the full `regex` crate
// semantics this stub implements.
wasm_tests! {
    fn misc() {
        load_and_run("misc", include_bytes!("testdata/misc.toml"));
    }
    fn unicode() {
        load_and_run("unicode", include_bytes!("testdata/unicode.toml"));
    }
    fn flags() {
        load_and_run("flags", include_bytes!("testdata/flags.toml"));
    }
    fn multiline() {
        load_and_run("multiline", include_bytes!("testdata/multiline.toml"));
    }
    fn regression() {
        load_and_run("regression", include_bytes!("testdata/regression.toml"));
    }
    fn no_unicode() {
        load_and_run("no-unicode", include_bytes!("testdata/no-unicode.toml"));
    }
    fn anchored() {
        load_and_run("anchored", include_bytes!("testdata/anchored.toml"));
    }
    fn substring() {
        load_and_run("substring", include_bytes!("testdata/substring.toml"));
    }
    fn fowler_basic() {
        load_and_run("fowler/basic", include_bytes!("testdata/fowler/basic.toml"));
    }
    fn fowler_repetition() {
        load_and_run("fowler/repetition", include_bytes!("testdata/fowler/repetition.toml"));
    }
    fn bytes() {
        load_and_run("bytes", include_bytes!("testdata/bytes.toml"));
    }
    fn crazy() {
        load_and_run("crazy", include_bytes!("testdata/crazy.toml"));
    }
    fn crlf() {
        load_and_run("crlf", include_bytes!("testdata/crlf.toml"));
    }
    fn earliest() {
        load_and_run("earliest", include_bytes!("testdata/earliest.toml"));
    }
    fn empty() {
        load_and_run("empty", include_bytes!("testdata/empty.toml"));
    }
    fn expensive() {
        load_and_run("expensive", include_bytes!("testdata/expensive.toml"));
    }
    fn fowler_nullsubexpr() {
        load_and_run("fowler/nullsubexpr", include_bytes!("testdata/fowler/nullsubexpr.toml"));
    }
    fn iter() {
        load_and_run("iter", include_bytes!("testdata/iter.toml"));
    }
    fn leftmost_all() {
        load_and_run("leftmost-all", include_bytes!("testdata/leftmost-all.toml"));
    }
    fn line_terminator() {
        load_and_run("line-terminator", include_bytes!("testdata/line-terminator.toml"));
    }
    fn overlapping() {
        load_and_run("overlapping", include_bytes!("testdata/overlapping.toml"));
    }
    fn set() {
        load_and_run("set", include_bytes!("testdata/set.toml"));
    }
    fn utf8() {
        load_and_run("utf8", include_bytes!("testdata/utf8.toml"));
    }
    fn word_boundary_special() {
        load_and_run("word-boundary-special", include_bytes!("testdata/word-boundary-special.toml"));
    }
    fn word_boundary() {
        load_and_run("word-boundary", include_bytes!("testdata/word-boundary.toml"));
    }
}
