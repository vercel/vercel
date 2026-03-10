#[cfg(feature = "upstream")]
extern crate regex_upstream as regex;

use std::borrow::Cow;

use regex::{Captures, Regex};

use wasm_test_support::wasm_tests;

wasm_tests! {
    // ---------------------------------------------------------------------------
    // Regex::new
    // ---------------------------------------------------------------------------

    #[test]
    fn new_valid_pattern() {
        assert!(Regex::new(r"\d+").is_ok());
    }

    #[test]
    fn new_invalid_pattern_is_rejected() {
        assert!(Regex::new("[").is_err());
    }

    // ---------------------------------------------------------------------------
    // replace_all -- literal &str replacer
    // ---------------------------------------------------------------------------

    #[test]
    fn replace_all_digits() {
        let re = Regex::new(r"[0-9]").unwrap();
        assert_eq!(re.replace_all("age: 26", "Z"), "age: ZZ");
    }

    #[test]
    fn replace_all_trim() {
        let re = Regex::new(r"^[ \t]+|[ \t]+$").unwrap();
        assert_eq!(re.replace_all(" \t  trim me\t   \t", ""), "trim me");
    }

    #[test]
    fn replace_all_at_start_with_empty() {
        let re = Regex::new(r"foo").unwrap();
        assert_eq!(re.replace_all("foobar", ""), "bar");
    }

    #[test]
    fn replace_all_no_match_returns_borrowed() {
        let re = Regex::new(r"xyz").unwrap();
        let result = re.replace_all("hello", "Z");
        assert_eq!(&*result, "hello");
        assert!(matches!(result, Cow::Borrowed(_)));
    }

    #[test]
    fn replace_all_str_replacer() {
        let re = Regex::new(r"world").unwrap();
        assert_eq!(re.replace_all("hello world", "earth"), "hello earth");
    }

    #[test]
    fn replace_all_string_replacer() {
        let re = Regex::new(r"world").unwrap();
        let replacement = String::from("earth");
        assert_eq!(re.replace_all("hello world", replacement), "hello earth");
    }

    // ---------------------------------------------------------------------------
    // replace_all -- closure replacer
    // ---------------------------------------------------------------------------

    #[test]
    fn replace_all_closure() {
        let re = Regex::new(r"\d+").unwrap();
        let result = re.replace_all("a]1[b]2[c", |caps: &Captures| {
            let m = caps.get(0).unwrap();
            format!("<{}>", m.as_str())
        });
        assert_eq!(&*result, "a]<1>[b]<2>[c");
    }

    #[test]
    fn replace_all_closure_with_named_group() {
        let re = Regex::new(r"(?P<first>\w+)\s+(?P<last>\w+)").unwrap();
        let result = re.replace_all("John Smith", |caps: &Captures| {
            let first = caps.name("first").unwrap().as_str();
            let last = caps.name("last").unwrap().as_str();
            format!("{}, {}", last, first)
        });
        assert_eq!(&*result, "Smith, John");
    }

    // ---------------------------------------------------------------------------
    // Captures -- named groups
    // ---------------------------------------------------------------------------

    #[test]
    fn capture_by_name() {
        let re = Regex::new(r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})").unwrap();
        let text = "date: 2025-03-15 end";
        let result = re.replace_all(text, |caps: &Captures| {
            let y = caps.name("year").unwrap().as_str();
            let m = caps.name("month").unwrap().as_str();
            let d = caps.name("day").unwrap().as_str();
            format!("{}/{}/{}", d, m, y)
        });
        assert_eq!(&*result, "date: 15/03/2025 end");
    }

    #[test]
    fn capture_name_missing_returns_none() {
        let re = Regex::new(r"(?P<a>\w+)").unwrap();
        let result = re.replace_all("hello", |caps: &Captures| {
            assert!(caps.name("nonexistent").is_none());
            caps.name("a").unwrap().as_str().to_uppercase()
        });
        assert_eq!(&*result, "HELLO");
    }

    // ---------------------------------------------------------------------------
    // Match -- positions
    // ---------------------------------------------------------------------------

    #[test]
    fn match_positions() {
        let re = Regex::new(r"world").unwrap();
        let result = re.replace_all("hello world!", |caps: &Captures| {
            let m = caps.get(0).unwrap();
            assert_eq!(m.start(), 6);
            assert_eq!(m.end(), 11);
            assert_eq!(m.as_str(), "world");
            String::from("earth")
        });
        assert_eq!(&*result, "hello earth!");
    }

    // ---------------------------------------------------------------------------
    // Captures -- index by name
    // ---------------------------------------------------------------------------

    #[test]
    fn index_by_name() {
        let re = Regex::new(r"(?P<word>\w+)").unwrap();
        let result = re.replace_all("hello", |caps: &Captures| {
            let word: &str = &caps["word"];
            word.to_uppercase()
        });
        assert_eq!(&*result, "HELLO");
    }

    // ---------------------------------------------------------------------------
    // Multiple matches
    // ---------------------------------------------------------------------------

    #[test]
    fn replace_all_multiple_matches() {
        let re = Regex::new(r"\b\w+\b").unwrap();
        let result = re.replace_all("a b c", |caps: &Captures| {
            caps.get(0).unwrap().as_str().to_uppercase()
        });
        assert_eq!(&*result, "A B C");
    }

    // ---------------------------------------------------------------------------
    // Positional capture groups
    // ---------------------------------------------------------------------------

    #[test]
    fn positional_group_get() {
        let re = Regex::new(r"(\d{4})-(\d{2})-(\d{2})").unwrap();
        let result = re.replace_all("date: 2025-03-15", |caps: &Captures| {
            let y = caps.get(1).unwrap().as_str();
            let m = caps.get(2).unwrap().as_str();
            let d = caps.get(3).unwrap().as_str();
            format!("{}/{}/{}", d, m, y)
        });
        assert_eq!(&*result, "date: 15/03/2025");
    }

    #[test]
    fn positional_group_out_of_range() {
        let re = Regex::new(r"(\w+)").unwrap();
        let result = re.replace_all("hello", |caps: &Captures| {
            assert!(caps.get(2).is_none());
            caps.get(1).unwrap().as_str().to_uppercase()
        });
        assert_eq!(&*result, "HELLO");
    }

    // ---------------------------------------------------------------------------
    // $ interpolation in string replacers
    // ---------------------------------------------------------------------------

    #[test]
    fn str_replacer_dollar_ref_positional() {
        let re = Regex::new(r"(\w+)\s+(\w+)").unwrap();
        assert_eq!(re.replace_all("hello world", "$2 $1"), "world hello");
    }

    #[test]
    fn str_replacer_dollar_ref_named() {
        let re = Regex::new(r"(?P<first>\w+)\s+(?P<last>\w+)").unwrap();
        assert_eq!(re.replace_all("John Smith", "$last, $first"), "Smith, John");
    }

    #[test]
    fn str_replacer_dollar_ref_braced() {
        let re = Regex::new(r"(?P<word>\w+)").unwrap();
        assert_eq!(re.replace_all("hello", "[${word}]"), "[hello]");
    }

    #[test]
    fn str_replacer_dollar_escape() {
        let re = Regex::new(r"\d+").unwrap();
        assert_eq!(re.replace_all("price: 42", "$$"), "price: $");
    }

    #[test]
    fn str_replacer_dollar_zero() {
        let re = Regex::new(r"\w+").unwrap();
        assert_eq!(re.replace_all("hello", "<$0>"), "<hello>");
    }

    // ---------------------------------------------------------------------------
    // Alternation patterns
    // ---------------------------------------------------------------------------

    #[test]
    fn alternation_simple() {
        let re = Regex::new(r"a|b|c").unwrap();
        let result = re.replace_all("xaybzc", |caps: &Captures| {
            caps.get(0).unwrap().as_str().to_uppercase()
        });
        assert_eq!(&*result, "xAyBzC");
    }

    // ---------------------------------------------------------------------------
    // Character classes
    // ---------------------------------------------------------------------------

    #[test]
    fn character_class_alphanumeric() {
        let re = Regex::new(r"[a-z0-9]+").unwrap();
        assert_eq!(re.replace_all("Hello World 42!", "[$0]"), "H[ello] W[orld] [42]!");
    }

    // ---------------------------------------------------------------------------
    // Anchors
    // ---------------------------------------------------------------------------

    #[test]
    fn anchors_start_end() {
        let re = Regex::new(r"^hello$").unwrap();
        assert_eq!(re.replace_all("hello", "matched"), "matched");
        let no_match = re.replace_all("say hello", "matched");
        assert!(matches!(no_match, Cow::Borrowed(_)));
    }

    // ---------------------------------------------------------------------------
    // Optional groups
    // ---------------------------------------------------------------------------

    #[test]
    fn optional_group_present() {
        let re = Regex::new(r"(a)?b").unwrap();
        let result = re.replace_all("ab", |caps: &Captures| {
            let a = caps.get(1).map(|m| m.as_str()).unwrap_or("NONE");
            format!("[{}]", a)
        });
        assert_eq!(&*result, "[a]");
    }

    #[test]
    fn optional_group_absent() {
        let re = Regex::new(r"(a)?b").unwrap();
        let result = re.replace_all("b", |caps: &Captures| {
            let a = caps.get(1).map(|m| m.as_str()).unwrap_or("NONE");
            format!("[{}]", a)
        });
        assert_eq!(&*result, "[NONE]");
    }

    // ---------------------------------------------------------------------------
    // Nested groups
    // ---------------------------------------------------------------------------

    #[test]
    fn nested_groups() {
        let re = Regex::new(r"((a)(b))").unwrap();
        let result = re.replace_all("ab", |caps: &Captures| {
            let g1 = caps.get(1).unwrap().as_str();
            let g2 = caps.get(2).unwrap().as_str();
            let g3 = caps.get(3).unwrap().as_str();
            format!("{}-{}-{}", g1, g2, g3)
        });
        assert_eq!(&*result, "ab-a-b");
    }

    // ---------------------------------------------------------------------------
    // Empty match edge cases
    // ---------------------------------------------------------------------------

    #[test]
    fn empty_pattern_matches() {
        let re = Regex::new(r"").unwrap();
        // Empty pattern inserts between every character
        assert_eq!(re.replace_all("ab", "X"), "XaXbX");
    }

    #[test]
    fn empty_pattern_matches_with_emoji() {
        // Emoji are 4 bytes in UTF-8 / surrogate pairs in UTF-16.
        // The zero-length match advancement must step over the full
        // code point, not half a surrogate pair.
        let re = Regex::new(r"").unwrap();
        assert_eq!(re.replace_all("\u{1F600}", "X"), "X\u{1F600}X");
        assert_eq!(re.replace_all("a\u{1F600}b", "X"), "XaX\u{1F600}XbX");
    }

    #[test]
    fn empty_pattern_matches_with_mixed_width_unicode() {
        // Mix of 1-byte (ASCII), 2-byte (é), 3-byte (あ), and 4-byte (😀)
        let re = Regex::new(r"").unwrap();
        assert_eq!(
            re.replace_all("a\u{00e9}\u{3042}\u{1F600}", "X"),
            "XaX\u{00e9}X\u{3042}X\u{1F600}X"
        );
    }

    // ---------------------------------------------------------------------------
    // Unicode in replacement text
    // ---------------------------------------------------------------------------

    #[test]
    fn unicode_replacement() {
        let re = Regex::new(r"hello").unwrap();
        assert_eq!(re.replace_all("hello", "\u{00e9}\u{00e8}\u{00ea}"), "\u{00e9}\u{00e8}\u{00ea}");
    }

    // ---------------------------------------------------------------------------
    // $ interpolation -- edge cases
    // ---------------------------------------------------------------------------

    #[test]
    fn str_replacer_mixed_dollar_with_unknown_name() {
        // Unknown $name is treated as empty
        let re = Regex::new(r"(\w+)\s+(\w+)").unwrap();
        assert_eq!(re.replace_all("a b", "$2 $c $1"), "b  a");
    }

    #[test]
    fn str_replacer_braced_vs_unbraced_disambiguation() {
        // ${1}a is group 1 followed by literal "a"
        // $1a is group named "1a" (doesn't exist) -> empty
        let re = Regex::new(r"(\w+)\s+(\w+)").unwrap();
        assert_eq!(re.replace_all("a b", "${1}a ${2}b"), "aa bb");
    }

    #[test]
    fn str_replacer_unbraced_longest_group_name() {
        // $1a parses as group name "1a" (not "$1" + "a") -- no such group -> empty
        let re = Regex::new(r"(\w+)").unwrap();
        assert_eq!(re.replace_all("x", "$1a"), "");
    }

    // ---------------------------------------------------------------------------
    // Anchor-only patterns
    // ---------------------------------------------------------------------------

    #[test]
    fn anchor_only_start() {
        let re = Regex::new(r"^").unwrap();
        assert_eq!(re.replace_all("ab", "X"), "Xab");
    }

    // ---------------------------------------------------------------------------
    // Unicode in source text -- match positions
    // ---------------------------------------------------------------------------

    #[test]
    fn unicode_source_match_positions() {
        // Verify byte offsets are correct with multi-byte UTF-8 chars
        let re = Regex::new(r"world").unwrap();
        let text = "\u{00e9} world";  // é is 2 bytes in UTF-8
        let result = re.replace_all(text, |caps: &Captures| {
            let m = caps.get(0).unwrap();
            assert_eq!(m.start(), 3);  // 2 bytes for é + 1 byte for space
            assert_eq!(m.end(), 8);
            assert_eq!(m.as_str(), "world");
            String::from("earth")
        });
        assert_eq!(&*result, "\u{00e9} earth");
    }

    #[test]
    fn match_positions_after_emoji() {
        // 😀 (U+1F600) is 4 bytes in UTF-8 / a surrogate pair in UTF-16.
        let re = Regex::new(r"world").unwrap();
        let text = "\u{1F600} world";
        let result = re.replace_all(text, |caps: &Captures| {
            let m = caps.get(0).unwrap();
            assert_eq!(m.start(), 5);  // 4 bytes for 😀 + 1 byte for space
            assert_eq!(m.end(), 10);
            assert_eq!(m.as_str(), "world");
            String::from("earth")
        });
        assert_eq!(&*result, "\u{1F600} earth");
    }

    #[test]
    fn match_emoji_itself() {
        // Match an emoji with a character class
        let re = Regex::new(r"\S+").unwrap();
        let text = "hi \u{1F600}\u{1F601} bye";
        let result = re.replace_all(text, |caps: &Captures| {
            format!("[{}]", caps.get(0).unwrap().as_str())
        });
        assert_eq!(&*result, "[hi] [\u{1F600}\u{1F601}] [bye]");
    }

    #[test]
    fn match_positions_multiple_emoji() {
        // Multiple surrogate pairs: verify offsets stay correct across the string.
        let re = Regex::new(r"x").unwrap();
        let text = "\u{1F600}x\u{1F601}x";  // 😀x😁x
        let result = re.replace_all(text, |caps: &Captures| {
            let m = caps.get(0).unwrap();
            assert_eq!(m.as_str(), "x");
            String::from("Y")
        });
        assert_eq!(&*result, "\u{1F600}Y\u{1F601}Y");
    }

    // ---------------------------------------------------------------------------
    // Repetition and greedy/lazy
    // ---------------------------------------------------------------------------

    #[test]
    fn greedy_vs_lazy_quantifier() {
        let re_greedy = Regex::new(r"a+").unwrap();
        assert_eq!(re_greedy.replace_all("aaa", "X"), "X");

        let re_lazy = Regex::new(r"a+?").unwrap();
        assert_eq!(re_lazy.replace_all("aaa", "X"), "XXX");
    }

    // ---------------------------------------------------------------------------
    // Non-capturing groups
    // ---------------------------------------------------------------------------

    #[test]
    fn non_capturing_group() {
        let re = Regex::new(r"(?:a)(b)").unwrap();
        let result = re.replace_all("ab", |caps: &Captures| {
            // Group 1 should be "b" (non-capturing group doesn't count)
            assert_eq!(caps.get(1).unwrap().as_str(), "b");
            assert!(caps.get(2).is_none());
            String::from("X")
        });
        assert_eq!(&*result, "X");
    }

    // ---------------------------------------------------------------------------
    // $ interpolation -- boundary and literal cases
    // ---------------------------------------------------------------------------

    #[test]
    fn str_replacer_dollar_hyphen_separator() {
        // Hyphen is not alphanumeric, so $1 and $2 parse cleanly
        let re = Regex::new(r"(\w+)\s+(\w+)").unwrap();
        assert_eq!(re.replace_all("a b", "$1-$2"), "a-b");
    }

    #[test]
    fn str_replacer_dollar_dot_suffix() {
        // Period after $1 is literal
        let re = Regex::new(r"(\d)").unwrap();
        assert_eq!(re.replace_all("1 2", "$1."), "1. 2.");
    }

    #[test]
    fn str_replacer_bare_dollar_at_end() {
        // Trailing bare $ becomes literal
        let re = Regex::new(r"x").unwrap();
        assert_eq!(re.replace_all("ax", "y$"), "ay$");
    }

    // ---------------------------------------------------------------------------
    // Named groups -- multiple matches in one pass
    // ---------------------------------------------------------------------------

    #[test]
    fn named_groups_multiple_matches() {
        let re = Regex::new(r"(?P<a>\w)\s(?P<b>\w)").unwrap();
        assert_eq!(re.replace_all("x y z w", "$b$a"), "yx wz");
    }

    // ---------------------------------------------------------------------------
    // Closure -- partial capture usage
    // ---------------------------------------------------------------------------

    #[test]
    fn closure_ignores_captures() {
        let re = Regex::new(r"\d+").unwrap();
        let result = re.replace_all("a1b2c", |_caps: &Captures| String::from("X"));
        assert_eq!(&*result, "aXbXc");
    }

    #[test]
    fn closure_partial_slice() {
        let re = Regex::new(r"(\w+)").unwrap();
        let result = re.replace_all("hello world", |caps: &Captures| {
            let s = caps.get(1).unwrap().as_str();
            s[0..1].to_uppercase()
        });
        assert_eq!(&*result, "H W");
    }

    // ---------------------------------------------------------------------------
    // Unicode-aware character classes (from upstream regex testdata/unicode.toml)
    // ---------------------------------------------------------------------------

    /// upstream: perl1 -- \w is Unicode-aware, so δ (Greek delta) is a word char.
    #[test]
    fn unicode_word_class_includes_greek() {
        let re = Regex::new(r"\w+").unwrap();
        assert_eq!(re.replace_all("dδd", "[$0]"), "[dδd]");
    }

    /// upstream: perl2 -- ⥡ is a symbol, not a word char.
    #[test]
    fn unicode_word_class_excludes_symbol() {
        let re = Regex::new(r"\w+").unwrap();
        let result = re.replace_all("⥡", "X");
        assert!(matches!(result, Cow::Borrowed(_)));
    }

    /// upstream: perl4 -- \d is Unicode-aware, so Devanagari digits match.
    #[test]
    fn unicode_digit_class_devanagari() {
        let re = Regex::new(r"\d+").unwrap();
        assert_eq!(re.replace_all("1२३9", "[$0]"), "[1२३9]");
    }

    /// upstream: perl5 -- Ⅱ (Roman numeral two) is NOT a Unicode digit.
    #[test]
    fn unicode_digit_class_excludes_roman_numeral() {
        let re = Regex::new(r"\d+").unwrap();
        let result = re.replace_all("Ⅱ", "X");
        assert!(matches!(result, Cow::Borrowed(_)));
    }

    /// upstream: perl7 -- \s is Unicode-aware, so U+3000 (ideographic space) matches.
    #[test]
    fn unicode_space_class_ideographic_space() {
        let re = Regex::new(r"\s+").unwrap();
        assert_eq!(re.replace_all("\u{3000}", "X"), "X");
    }

    /// upstream: perl8 -- ☃ is not whitespace.
    #[test]
    fn unicode_space_class_excludes_snowman() {
        let re = Regex::new(r"\s+").unwrap();
        let result = re.replace_all("☃", "X");
        assert!(matches!(result, Cow::Borrowed(_)));
    }

    // ---------------------------------------------------------------------------
    // Unicode word boundaries (from upstream regex testdata/unicode.toml)
    // ---------------------------------------------------------------------------

    /// upstream: wb-100 -- \b between digit and δ is NOT a word boundary
    /// (both are word chars in Unicode), so \d\b should NOT match.
    #[test]
    fn unicode_word_boundary_digit_before_greek() {
        let re = Regex::new(r"\d\b").unwrap();
        let result = re.replace_all("6δ", "X");
        assert!(matches!(result, Cow::Borrowed(_)));
    }

    /// upstream: wb-200 -- \b between digit and space IS a word boundary.
    #[test]
    fn unicode_word_boundary_digit_before_space() {
        let re = Regex::new(r"\d\b").unwrap();
        assert_eq!(re.replace_all("6 ", "X"), "X ");
    }

    /// upstream: wb-300 -- \B between digit and δ IS a non-boundary
    /// (both are word chars), so \d\B should match.
    #[test]
    fn unicode_non_word_boundary_digit_before_greek() {
        let re = Regex::new(r"\d\B").unwrap();
        assert_eq!(re.replace_all("6δ", "X"), "Xδ");
    }

    /// upstream: wb-400 -- \B between digit and space is NOT a non-boundary.
    #[test]
    fn unicode_non_word_boundary_digit_before_space() {
        let re = Regex::new(r"\d\B").unwrap();
        let result = re.replace_all("6 ", "X");
        assert!(matches!(result, Cow::Borrowed(_)));
    }

    // ---------------------------------------------------------------------------
    // Lone `}` escaping (JS unicode mode compatibility)
    // ---------------------------------------------------------------------------

    /// Pattern from uv-pep508 that contains a bare `}` after a group close.
    /// In JS unicode mode, unmatched `}` is a syntax error; translate_pattern
    /// must escape it.
    #[test]
    fn lone_closing_brace_in_pattern() {
        let re = Regex::new(r"(?P<var>\$\{(?P<name>[A-Z0-9_]+)})").unwrap();
        let result = re.replace_all("home=${HOME} path=${PATH}", |caps: &Captures| {
            format!("[{}]", caps.name("name").unwrap().as_str())
        });
        assert_eq!(&*result, "home=[HOME] path=[PATH]");
    }

    /// Lone `}` at the start of a pattern.
    #[test]
    fn lone_closing_brace_at_start() {
        let re = Regex::new(r"}").unwrap();
        assert_eq!(re.replace_all("a}b}c", "X"), "aXbXc");
    }

    /// Matched braces (quantifiers) must not be escaped.
    #[test]
    fn matched_braces_quantifier_unchanged() {
        let re = Regex::new(r"\d{2,4}").unwrap();
        assert_eq!(re.replace_all("1 12 123 1234 12345", "X"), "1 X X X X5");
    }
}
