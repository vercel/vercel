#[cfg(feature = "upstream")]
extern crate unicode_normalization_upstream as unicode_normalization;

use unicode_normalization::UnicodeNormalization;

use wasm_test_support::wasm_tests;

wasm_tests! {
    // ---------------------------------------------------------------------------
    // NFC composition
    // ---------------------------------------------------------------------------

    #[test]
    fn nfc_combines_e_acute() {
        // U+0065 (e) + U+0301 (combining acute) -> U+00E9 (é)
        let input = "e\u{0301}";
        let result: String = input.nfc().collect();
        assert_eq!(result, "\u{00E9}");
    }

    // ---------------------------------------------------------------------------
    // NFD decomposition
    // ---------------------------------------------------------------------------

    #[test]
    fn nfd_decomposes_e_acute() {
        // U+00E9 (é) -> U+0065 (e) + U+0301 (combining acute)
        let input = "\u{00E9}";
        let result: String = input.nfd().collect();
        assert_eq!(result, "e\u{0301}");
    }

    // ---------------------------------------------------------------------------
    // NFKC -- compatibility composition
    // ---------------------------------------------------------------------------

    #[test]
    fn nfkc_decomposes_ligature() {
        // U+FB01 (ﬁ ligature) -> "fi"
        let input = "\u{FB01}";
        let result: String = input.nfkc().collect();
        assert_eq!(result, "fi");
    }

    // ---------------------------------------------------------------------------
    // NFKD -- compatibility decomposition
    // ---------------------------------------------------------------------------

    #[test]
    fn nfkd_decomposes_ligature() {
        // U+FB01 (ﬁ ligature) -> "fi"
        let input = "\u{FB01}";
        let result: String = input.nfkd().collect();
        assert_eq!(result, "fi");
    }

    // ---------------------------------------------------------------------------
    // ASCII passthrough (all four forms)
    // ---------------------------------------------------------------------------

    #[test]
    fn nfc_ascii_passthrough() {
        let input = "hello world 123";
        let result: String = input.nfc().collect();
        assert_eq!(result, input);
    }

    #[test]
    fn nfd_ascii_passthrough() {
        let input = "hello world 123";
        let result: String = input.nfd().collect();
        assert_eq!(result, input);
    }

    #[test]
    fn nfkc_ascii_passthrough() {
        let input = "hello world 123";
        let result: String = input.nfkc().collect();
        assert_eq!(result, input);
    }

    #[test]
    fn nfkd_ascii_passthrough() {
        let input = "hello world 123";
        let result: String = input.nfkd().collect();
        assert_eq!(result, input);
    }

    // ---------------------------------------------------------------------------
    // Already-normalized text unchanged
    // ---------------------------------------------------------------------------

    #[test]
    fn nfc_already_normalized() {
        let input = "\u{00E9}"; // é is already NFC
        let result: String = input.nfc().collect();
        assert_eq!(result, input);
    }

    #[test]
    fn nfd_already_decomposed() {
        let input = "e\u{0301}"; // already NFD
        let result: String = input.nfd().collect();
        assert_eq!(result, input);
    }

    // ---------------------------------------------------------------------------
    // Hangul syllable composition/decomposition
    // ---------------------------------------------------------------------------

    #[test]
    fn nfc_hangul_composition() {
        // U+1100 (ᄀ) + U+1161 (ᅡ) -> U+AC00 (가)
        let input = "\u{1100}\u{1161}";
        let result: String = input.nfc().collect();
        assert_eq!(result, "\u{AC00}");
    }

    #[test]
    fn nfd_hangul_decomposition() {
        // U+AC00 (가) -> U+1100 (ᄀ) + U+1161 (ᅡ)
        let input = "\u{AC00}";
        let result: String = input.nfd().collect();
        assert_eq!(result, "\u{1100}\u{1161}");
    }

    // ---------------------------------------------------------------------------
    // Multiple combining marks ordering
    // ---------------------------------------------------------------------------

    #[test]
    fn nfc_multiple_combining_marks() {
        // o + combining diaeresis (U+0308) + combining acute (U+0301)
        let input = "o\u{0308}\u{0301}";
        let result: String = input.nfc().collect();
        // Should compose o+diaeresis to ö (U+00F6), then keep combining acute
        assert_eq!(result, "\u{00F6}\u{0301}");
    }

    // ---------------------------------------------------------------------------
    // Iterator collect correctness
    // ---------------------------------------------------------------------------

    #[test]
    fn nfc_iterator_collect() {
        let input = "e\u{0301}e\u{0301}";
        let result: String = input.nfc().collect();
        assert_eq!(result, "\u{00E9}\u{00E9}");
    }

    #[test]
    fn nfd_iterator_collect() {
        let input = "\u{00E9}\u{00E9}";
        let result: String = input.nfd().collect();
        assert_eq!(result, "e\u{0301}e\u{0301}");
    }

    // ---------------------------------------------------------------------------
    // Combining mark reordering
    // ---------------------------------------------------------------------------

    #[test]
    fn nfc_combining_mark_reorder() {
        // U+1E0B (ḋ, d with dot above) + U+0323 (combining dot below)
        // NFC should reorder: -> U+1E0D (ḍ, d with dot below) + U+0307 (combining dot above)
        let input = "\u{1E0B}\u{0323}";
        let result: String = input.nfc().collect();
        assert_eq!(result, "\u{1E0D}\u{0307}");
    }

    #[test]
    fn nfd_combining_mark_reorder() {
        // Same input decomposed: d + dot above + dot below -> d + dot below + dot above
        let input = "\u{1E0B}\u{0323}";
        let result: String = input.nfd().collect();
        // NFD: d (U+0064) + dot below (U+0323) + dot above (U+0307)
        assert_eq!(result, "d\u{0323}\u{0307}");
    }

    // ---------------------------------------------------------------------------
    // Compatibility vs canonical difference
    // ---------------------------------------------------------------------------

    #[test]
    fn nfc_preserves_ellipsis() {
        // U+2026 (…) is canonically stable -- NFC should not decompose it
        let input = "\u{2026}";
        let result: String = input.nfc().collect();
        assert_eq!(result, "\u{2026}");
    }

    #[test]
    fn nfkc_decomposes_ellipsis() {
        // U+2026 (…) -> "..." under compatibility decomposition
        let input = "\u{2026}";
        let result: String = input.nfkc().collect();
        assert_eq!(result, "...");
    }

    #[test]
    fn nfkd_decomposes_ellipsis() {
        let input = "\u{2026}";
        let result: String = input.nfkd().collect();
        assert_eq!(result, "...");
    }

    // ---------------------------------------------------------------------------
    // Idempotency
    // ---------------------------------------------------------------------------

    #[test]
    fn nfc_idempotent() {
        let input = "e\u{0301}\u{00E9}\u{FB01}café";
        let once: String = input.nfc().collect();
        let twice: String = once.nfc().collect();
        assert_eq!(once, twice);
    }

    #[test]
    fn nfd_idempotent() {
        let input = "\u{00E9}\u{00F6}\u{00FC}";
        let once: String = input.nfd().collect();
        let twice: String = once.nfd().collect();
        assert_eq!(once, twice);
    }

    #[test]
    fn nfkc_idempotent() {
        let input = "\u{FB01}\u{2026}\u{00E9}";
        let once: String = input.nfkc().collect();
        let twice: String = once.nfkc().collect();
        assert_eq!(once, twice);
    }

    // ---------------------------------------------------------------------------
    // NFKD-specific decomposition
    // ---------------------------------------------------------------------------

    #[test]
    fn nfkd_decomposes_superscript() {
        // U+00B2 (²) -> "2" under NFKD
        let input = "\u{00B2}";
        let result: String = input.nfkd().collect();
        assert_eq!(result, "2");
    }

    #[test]
    fn nfkc_decomposes_superscript() {
        // U+00B2 (²) -> "2" under NFKC as well
        let input = "\u{00B2}";
        let result: String = input.nfkc().collect();
        assert_eq!(result, "2");
    }

    #[test]
    fn nfc_preserves_superscript() {
        // Canonical normalization does NOT decompose compatibility chars
        let input = "\u{00B2}";
        let result: String = input.nfc().collect();
        assert_eq!(result, "\u{00B2}");
    }

    // ---------------------------------------------------------------------------
    // Hangul with trailing consonant
    // ---------------------------------------------------------------------------

    #[test]
    fn nfc_hangul_lvt() {
        // U+1100 (ᄀ) + U+1161 (ᅡ) + U+11A8 (ᆨ) -> U+AC01 (각)
        let input = "\u{1100}\u{1161}\u{11A8}";
        let result: String = input.nfc().collect();
        assert_eq!(result, "\u{AC01}");
    }

    #[test]
    fn nfd_hangul_lvt() {
        // U+AC01 (각) -> U+1100 (ᄀ) + U+1161 (ᅡ) + U+11A8 (ᆨ)
        let input = "\u{AC01}";
        let result: String = input.nfd().collect();
        assert_eq!(result, "\u{1100}\u{1161}\u{11A8}");
    }

    // ---------------------------------------------------------------------------
    // Empty string
    // ---------------------------------------------------------------------------

    #[test]
    fn empty_string_all_forms() {
        let empty = "";
        assert_eq!(empty.nfc().collect::<String>(), "");
        assert_eq!(empty.nfd().collect::<String>(), "");
        assert_eq!(empty.nfkc().collect::<String>(), "");
        assert_eq!(empty.nfkd().collect::<String>(), "");
    }

    // ---------------------------------------------------------------------------
    // Compatibility-only decompositions (NFC preserves, NFKC decomposes)
    // ---------------------------------------------------------------------------

    #[test]
    fn nfkc_decomposes_interrobang() {
        // U+2049 (⁉) -> "!?" under NFKC
        let input = "\u{2049}";
        let result: String = input.nfkc().collect();
        assert_eq!(result, "!?");
    }

    #[test]
    fn nfc_preserves_interrobang() {
        let input = "\u{2049}";
        let result: String = input.nfc().collect();
        assert_eq!(result, "\u{2049}");
    }

    #[test]
    fn nfkc_decomposes_circled_latin() {
        // U+24B6 (Ⓐ) -> "A" under NFKC
        let input = "\u{24B6}";
        let result: String = input.nfkc().collect();
        assert_eq!(result, "A");
    }

    #[test]
    fn nfkd_decomposes_fraction() {
        // U+00BD (½) -> "1⁄2" under NFKD (1 + fraction slash + 2)
        let input = "\u{00BD}";
        let result: String = input.nfkd().collect();
        assert_eq!(result, "1\u{2044}2");
    }

    #[test]
    fn nfc_preserves_fraction() {
        let input = "\u{00BD}";
        let result: String = input.nfc().collect();
        assert_eq!(result, "\u{00BD}");
    }

    // ---------------------------------------------------------------------------
    // Complex combining mark ordering (3+ marks)
    // ---------------------------------------------------------------------------

    #[test]
    fn nfc_three_combining_marks() {
        // D + dot above (class 230) + dot below (class 220) + cedilla (class 202)
        // Should reorder by class: cedilla (202) < dot below (220) < dot above (230)
        let input = "D\u{0307}\u{0323}\u{0327}";
        let result: String = input.nfc().collect();
        let nfd_result: String = result.nfd().collect();
        // After NFC->NFD round-trip, marks should be in canonical order
        let expected_nfd: String = input.nfd().collect();
        assert_eq!(nfd_result, expected_nfd);
    }

    // ---------------------------------------------------------------------------
    // Leading combining marks
    // ---------------------------------------------------------------------------

    #[test]
    fn nfc_leading_combining_mark() {
        // A combining mark at the start of a string stays put
        let input = "\u{0301}a";
        let result: String = input.nfc().collect();
        assert_eq!(result, "\u{0301}a");
    }

    #[test]
    fn nfd_leading_combining_mark() {
        let input = "\u{0301}a";
        let result: String = input.nfd().collect();
        assert_eq!(result, "\u{0301}a");
    }

    // ---------------------------------------------------------------------------
    // NFC/NFD round-trip stability
    // ---------------------------------------------------------------------------

    #[test]
    fn nfc_nfd_roundtrip() {
        let input = "\u{00E9}\u{00F6}\u{00FC}café";
        let nfd: String = input.nfd().collect();
        let back: String = nfd.nfc().collect();
        let expected: String = input.nfc().collect();
        assert_eq!(back, expected);
    }

    // ---------------------------------------------------------------------------
    // CJK compatibility variants
    // ---------------------------------------------------------------------------

    #[test]
    fn cjk_compat_variants_passthrough() {
        // For plain ASCII, cjk_compat_variants is a no-op
        let input = "hello";
        let result: String = input.cjk_compat_variants().collect();
        assert_eq!(result, "hello");
    }

    #[test]
    fn stream_safe_passthrough() {
        // stream_safe should pass through normal text
        let input = "hello world";
        let result: String = input.stream_safe().collect();
        assert_eq!(result, "hello world");
    }
}
