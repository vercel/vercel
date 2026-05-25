// Derived from the idna crate (https://github.com/servo/rust-url).
// Copyright (c) The Servo Project Developers.
// Licensed under the Apache License, Version 2.0 or the MIT License.

//! Stubbed `idna` crate that delegates IDNA processing to the JS host
//! via WIT imports, eliminating overhead of ICU lookup tables.

#![no_std]

extern crate alloc;

#[cfg(feature = "std")]
extern crate std;

use alloc::borrow::Cow;
use alloc::string::String;

pub mod uts46;

pub use uts46::AsciiDenyList;

/// Type indicating errors during IDNA processing.
#[derive(Default, Debug)]
#[non_exhaustive]
pub struct Errors {}

impl From<Errors> for Result<(), Errors> {
    fn from(e: Errors) -> Self {
        Err(e)
    }
}

#[cfg(feature = "std")]
impl std::error::Error for Errors {}

#[cfg(not(feature = "std"))]
impl core::error::Error for Errors {}

impl core::fmt::Display for Errors {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        core::fmt::Debug::fmt(self, f)
    }
}

/// Check if a byte sequence is all ASCII lowercase (or non-alpha).
fn is_ascii_lowercase_domain(domain: &[u8]) -> bool {
    domain.iter().all(|&b| b != 0 && !b.is_ascii_uppercase())
}

/// Check if a byte sequence is all ASCII.
fn is_all_ascii(domain: &[u8]) -> bool {
    domain.iter().all(|&b| b < 0x80)
}

/// Check if any label starts with `xn--` (punycode prefix).
fn has_punycode_label(domain: &[u8]) -> bool {
    domain
        .split(|&b| b == b'.')
        .any(|label| label.starts_with(b"xn--"))
}

/// Check if the domain contains any characters forbidden by the given deny list.
fn check_deny_list(domain: &str, ascii_deny_list: AsciiDenyList) -> bool {
    domain.bytes().any(|b| ascii_deny_list.denies(b))
}

/// The [domain to ASCII](https://url.spec.whatwg.org/#concept-domain-to-ascii) algorithm;
/// version accepting and returning a `Cow`.
pub fn domain_to_ascii_from_cow(
    domain: Cow<'_, [u8]>,
    ascii_deny_list: AsciiDenyList,
) -> Result<Cow<'_, str>, Errors> {
    // Fast path: all-ASCII lowercase domain with no denied chars.
    // Domains with xn-- labels need punycode validation via the host.
    if is_all_ascii(&domain)
        && is_ascii_lowercase_domain(&domain)
        && !has_punycode_label(&domain)
    {
        match domain {
            Cow::Borrowed(b) => {
                let s = core::str::from_utf8(b).map_err(|_| Errors {})?;
                if !check_deny_list(s, ascii_deny_list) {
                    return Ok(Cow::Borrowed(s));
                }
                return Err(Errors {});
            }
            Cow::Owned(b) => {
                let s = String::from_utf8(b).map_err(|_| Errors {})?;
                if !check_deny_list(&s, ascii_deny_list) {
                    return Ok(Cow::Owned(s));
                }
                return Err(Errors {});
            }
        }
    }

    // Delegate to host for normalization
    let domain_str = match &domain {
        Cow::Borrowed(b) => core::str::from_utf8(b).map_err(|_| Errors {})?,
        Cow::Owned(b) => core::str::from_utf8(b).map_err(|_| Errors {})?,
    };
    let result = host_bridge::domain_to_ascii(domain_str).map_err(|_| Errors {})?;

    if check_deny_list(&result, ascii_deny_list) {
        return Err(Errors {});
    }

    Ok(Cow::Owned(result))
}

/// The [domain to Unicode](https://url.spec.whatwg.org/#concept-domain-to-unicode) algorithm.
///
/// Delegates to the JS host for full UTS #46 processing: punycode decoding,
/// case folding, and NFC normalization.
pub fn domain_to_unicode(domain: &str) -> (String, Result<(), Errors>) {
    let (result, ok) = host_bridge::domain_to_unicode(domain);
    if ok {
        (result, Ok(()))
    } else {
        (result, Err(Errors {}))
    }
}
