#[cfg(feature = "upstream")]
extern crate idna_upstream as idna;

use std::borrow::Cow;

use idna::{domain_to_ascii_from_cow, domain_to_unicode};
use idna::AsciiDenyList;

use wasm_test_support::wasm_tests;

/// Helper: run domain_to_ascii_from_cow with borrowed input and EMPTY deny list.
fn domain_to_ascii(domain: &str) -> Result<String, idna::Errors> {
    domain_to_ascii_from_cow(Cow::Borrowed(domain.as_bytes()), AsciiDenyList::EMPTY)
        .map(|cow| cow.into_owned())
}

wasm_tests! {
    // ---------------------------------------------------------------------------
    // domain_to_ascii_from_cow -- basic
    // ---------------------------------------------------------------------------

    #[test]
    fn ascii_passthrough() {
        assert_eq!(domain_to_ascii("example.com").unwrap(), "example.com");
    }

    #[test]
    fn lowercase_normalization() {
        assert_eq!(domain_to_ascii("EXAMPLE.COM").unwrap(), "example.com");
    }

    #[test]
    fn mixed_case_normalization() {
        assert_eq!(domain_to_ascii("Example.Org").unwrap(), "example.org");
    }

    #[test]
    fn unicode_domain() {
        // Node.js URL API uses IDNA2008: 日本語.jp -> xn--wgv71a119e.jp
        assert_eq!(domain_to_ascii("日本語.jp").unwrap(), "xn--wgv71a119e.jp");
    }

    #[test]
    fn emoji_domain() {
        assert_eq!(domain_to_ascii("☕.com").unwrap(), "xn--53h.com");
    }

    #[test]
    fn german_eszett() {
        // Node.js URL API uses IDNA2008: ß is preserved (not mapped to "ss")
        assert_eq!(domain_to_ascii("Bloß.de").unwrap(), "xn--blo-7ka.de");
    }

    #[test]
    fn empty_domain() {
        assert_eq!(domain_to_ascii("").unwrap(), "");
    }

    // ---------------------------------------------------------------------------
    // domain_to_unicode
    // ---------------------------------------------------------------------------

    #[test]
    fn unicode_passthrough() {
        let (result, errors) = domain_to_unicode("example.com");
        assert_eq!(result, "example.com");
        assert!(errors.is_ok());
    }

    // ---------------------------------------------------------------------------
    // domain_to_ascii_from_cow -- borrowing behavior
    // ---------------------------------------------------------------------------

    #[test]
    fn from_cow_borrows_ascii_lowercase() {
        let input: Cow<[u8]> = Cow::Borrowed(b"example.com");
        let result = domain_to_ascii_from_cow(input, AsciiDenyList::EMPTY).unwrap();
        assert!(matches!(result, Cow::Borrowed(_)));
        assert_eq!(&*result, "example.com");
    }

    #[test]
    fn from_cow_owned_for_uppercase() {
        let input: Cow<[u8]> = Cow::Borrowed(b"EXAMPLE.COM");
        let result = domain_to_ascii_from_cow(input, AsciiDenyList::EMPTY).unwrap();
        assert!(matches!(result, Cow::Owned(_)));
        assert_eq!(&*result, "example.com");
    }

    #[test]
    fn from_cow_owned_input() {
        let input: Cow<[u8]> = Cow::Owned(b"example.com".to_vec());
        let result = domain_to_ascii_from_cow(input, AsciiDenyList::EMPTY).unwrap();
        assert!(matches!(result, Cow::Owned(_)));
        assert_eq!(&*result, "example.com");
    }

    // ---------------------------------------------------------------------------
    // AsciiDenyList
    // ---------------------------------------------------------------------------

    #[test]
    fn deny_list_url_rejects_space() {
        let result = domain_to_ascii_from_cow(Cow::Borrowed(b"exam ple.com"), AsciiDenyList::URL);
        assert!(result.is_err());
    }

    #[test]
    fn deny_list_url_rejects_hash() {
        let result = domain_to_ascii_from_cow(Cow::Borrowed(b"example.com#fragment"), AsciiDenyList::URL);
        assert!(result.is_err());
    }

    #[test]
    fn deny_list_std3_rejects_underscore() {
        let result = domain_to_ascii_from_cow(Cow::Borrowed(b"ex_ample.com"), AsciiDenyList::STD3);
        assert!(result.is_err());
    }

    #[test]
    fn deny_list_empty_allows_all_ascii() {
        let result = domain_to_ascii_from_cow(Cow::Borrowed(b"ex_ample.com"), AsciiDenyList::EMPTY);
        assert!(result.is_ok());
        assert_eq!(&*result.unwrap(), "ex_ample.com");
    }

    #[test]
    fn deny_list_empty_allows_space() {
        let result = domain_to_ascii_from_cow(Cow::Borrowed(b"exam ple.com"), AsciiDenyList::EMPTY);
        assert!(result.is_ok());
    }

    // ---------------------------------------------------------------------------
    // Multiple labels
    // ---------------------------------------------------------------------------

    #[test]
    fn multiple_labels() {
        assert_eq!(domain_to_ascii("a.b.c.d").unwrap(), "a.b.c.d");
    }

    // ---------------------------------------------------------------------------
    // Trailing dot
    // ---------------------------------------------------------------------------

    #[test]
    fn trailing_dot() {
        assert_eq!(domain_to_ascii("example.com.").unwrap(), "example.com.");
    }

    // ---------------------------------------------------------------------------
    // Mixed Unicode/ASCII labels
    // ---------------------------------------------------------------------------

    #[test]
    fn mixed_unicode_ascii_labels() {
        let result = domain_to_ascii("api.\u{65E5}\u{672C}\u{8A9E}.jp").unwrap();
        assert_eq!(result, "api.xn--wgv71a119e.jp");
    }

    // ---------------------------------------------------------------------------
    // Already-punycode passthrough
    // ---------------------------------------------------------------------------

    #[test]
    fn already_punycode_passthrough() {
        assert_eq!(
            domain_to_ascii("xn--nxasmq6b.com").unwrap(),
            "xn--nxasmq6b.com"
        );
    }

    // ---------------------------------------------------------------------------
    // AsciiDenyList -- URL-specific deny characters
    // ---------------------------------------------------------------------------

    #[test]
    fn deny_list_url_rejects_percent() {
        let result = domain_to_ascii_from_cow(Cow::Borrowed(b"exam%ple.com"), AsciiDenyList::URL);
        assert!(result.is_err());
    }

    #[test]
    fn deny_list_url_rejects_backslash() {
        let result = domain_to_ascii_from_cow(Cow::Borrowed(b"exam\\ple.com"), AsciiDenyList::URL);
        assert!(result.is_err());
    }

    // ---------------------------------------------------------------------------
    // Single-label domains
    // ---------------------------------------------------------------------------

    #[test]
    fn single_label() {
        assert_eq!(domain_to_ascii("localhost").unwrap(), "localhost");
    }

    #[test]
    fn single_label_uppercase() {
        assert_eq!(domain_to_ascii("LOCALHOST").unwrap(), "localhost");
    }

    // ---------------------------------------------------------------------------
    // Long domain
    // ---------------------------------------------------------------------------

    #[test]
    fn multi_level_subdomain() {
        let domain = "a.b.c.d.e.f.example.com";
        assert_eq!(domain_to_ascii(domain).unwrap(), domain);
    }

    // ---------------------------------------------------------------------------
    // Numeric domains
    // ---------------------------------------------------------------------------

    #[test]
    fn numeric_labels() {
        assert_eq!(domain_to_ascii("123.456.789").unwrap(), "123.456.789");
    }

    // ---------------------------------------------------------------------------
    // domain_to_unicode -- more cases
    // ---------------------------------------------------------------------------

    #[test]
    fn domain_to_unicode_unicode_input() {
        let (result, errors) = domain_to_unicode("\u{00E9}xample.com");
        assert_eq!(result, "\u{00E9}xample.com");
        assert!(errors.is_ok());
    }

    // ---------------------------------------------------------------------------
    // AsciiDenyList::URL -- more forbidden characters
    // ---------------------------------------------------------------------------

    #[test]
    fn deny_list_url_rejects_question_mark() {
        let result = domain_to_ascii_from_cow(Cow::Borrowed(b"exam?ple.com"), AsciiDenyList::URL);
        assert!(result.is_err());
    }

    #[test]
    fn deny_list_url_rejects_at_sign() {
        let result = domain_to_ascii_from_cow(Cow::Borrowed(b"exam@ple.com"), AsciiDenyList::URL);
        assert!(result.is_err());
    }

    #[test]
    fn deny_list_url_rejects_slash() {
        let result = domain_to_ascii_from_cow(Cow::Borrowed(b"exam/ple.com"), AsciiDenyList::URL);
        assert!(result.is_err());
    }

    // ---------------------------------------------------------------------------
    // domain_to_unicode -- additional cases
    // ---------------------------------------------------------------------------

    #[test]
    fn domain_to_unicode_already_punycode() {
        let (result, _errors) = domain_to_unicode("xn--nxasmq6b.com");
        // Should return the decoded Unicode form
        assert!(!result.is_empty());
    }

    #[test]
    fn domain_to_unicode_ascii_uppercase() {
        let (result, errors) = domain_to_unicode("EXAMPLE.COM");
        assert_eq!(result, "example.com");
        assert!(errors.is_ok());
    }

    // ---------------------------------------------------------------------------
    // Invalid punycode error cases
    // ---------------------------------------------------------------------------

    #[test]
    fn invalid_punycode_bare_prefix() {
        assert!(domain_to_ascii("xn--").is_err());
    }

    #[test]
    fn invalid_punycode_bad_encoding() {
        assert!(domain_to_ascii("xn--55555577").is_err());
    }

    #[test]
    fn invalid_punycode_in_multi_label() {
        assert!(domain_to_ascii("xn--.example.org").is_err());
    }

    // ---------------------------------------------------------------------------
    // @ in domain -- must not be silently consumed as userinfo
    // ---------------------------------------------------------------------------

    #[test]
    fn deny_list_url_rejects_at_sign_via_host() {
        // This domain has uppercase, so the fast path is skipped and
        // the host is called.  The host must reject '@' to avoid
        // URL-parsing it as userinfo (user@host).
        let result = domain_to_ascii_from_cow(
            Cow::Borrowed(b"User@Example.com"),
            AsciiDenyList::URL,
        );
        assert!(result.is_err());
    }

}
