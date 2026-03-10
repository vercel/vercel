//! Stubbed `unicode-normalization` crate that delegates normalization
//! to the JS host via WIT imports, eliminating ~180 KB of lookup tables.
//!
//! All four Unicode normalization forms (NFC, NFD, NFKC, NFKD) are provided
//! via host calls to `String.prototype.normalize()`.

#![cfg_attr(not(feature = "std"), no_std)]

#[cfg(not(feature = "std"))]
extern crate alloc;

#[cfg(not(feature = "std"))]
use alloc::string::String;
#[cfg(not(feature = "std"))]
use alloc::vec::Vec;

#[cfg(feature = "std")]
use std::string::String;
#[cfg(feature = "std")]
use std::vec::Vec;

use core::str::Chars;
use core::{fmt, option};

/// Unicode version stub.
pub const UNICODE_VERSION: (u8, u8, u8) = (16, 0, 0);

// ---------------------------------------------------------------------------
// Shared eager-normalization iterator
// ---------------------------------------------------------------------------

/// Collects an iterator into a String, applies a normalization function,
/// and returns the result as a Vec<char>.
fn eager_normalize(iter: impl Iterator<Item = char>, host_fn: fn(&str) -> String) -> Vec<char> {
    let input: String = iter.collect();
    if input.is_ascii() {
        return input.chars().collect();
    }
    host_fn(&input).chars().collect()
}

// ---------------------------------------------------------------------------
// Iterator types -- replicate the public API of unicode-normalization
// ---------------------------------------------------------------------------

/// Iterator adaptor for NFC / NFKC recomposition.
///
/// In this patched version, the host call is made eagerly when the iterator
/// is constructed, and `next()` simply yields characters from the result.
pub struct Recompositions<I> {
    chars: Vec<char>,
    pos: usize,
    _marker: core::marker::PhantomData<I>,
}

impl<I: Iterator<Item = char>> Recompositions<I> {
    #[inline]
    pub fn new_canonical(iter: I) -> Self {
        let chars = eager_normalize(iter, host_bridge::nfc_normalize);
        Recompositions {
            chars,
            pos: 0,
            _marker: core::marker::PhantomData,
        }
    }

    #[inline]
    pub fn new_compatible(iter: I) -> Self {
        let chars = eager_normalize(iter, host_bridge::nfkc_normalize);
        Recompositions {
            chars,
            pos: 0,
            _marker: core::marker::PhantomData,
        }
    }
}

impl<I: Iterator<Item = char>> Iterator for Recompositions<I> {
    type Item = char;

    #[inline]
    fn next(&mut self) -> Option<char> {
        if self.pos < self.chars.len() {
            let c = self.chars[self.pos];
            self.pos += 1;
            Some(c)
        } else {
            None
        }
    }

    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.chars.len() - self.pos;
        (remaining, Some(remaining))
    }
}

impl<I: Iterator<Item = char>> core::iter::FusedIterator for Recompositions<I> {}

impl<I: Iterator<Item = char> + Clone> fmt::Display for Recompositions<I> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for &c in &self.chars[self.pos..] {
            f.write_str(c.encode_utf8(&mut [0u8; 4]))?;
        }
        Ok(())
    }
}

/// Iterator adaptor for NFD / NFKD decomposition.
///
/// In this patched version, the host call is made eagerly when the iterator
/// is constructed, and `next()` simply yields characters from the result.
pub struct Decompositions<I> {
    chars: Vec<char>,
    pos: usize,
    _marker: core::marker::PhantomData<I>,
}

impl<I: Iterator<Item = char>> Decompositions<I> {
    #[inline]
    pub fn new_canonical(iter: I) -> Self {
        let chars = eager_normalize(iter, host_bridge::nfd_normalize);
        Decompositions {
            chars,
            pos: 0,
            _marker: core::marker::PhantomData,
        }
    }

    #[inline]
    pub fn new_compatible(iter: I) -> Self {
        let chars = eager_normalize(iter, host_bridge::nfkd_normalize);
        Decompositions {
            chars,
            pos: 0,
            _marker: core::marker::PhantomData,
        }
    }
}

impl<I: Iterator<Item = char>> Iterator for Decompositions<I> {
    type Item = char;

    #[inline]
    fn next(&mut self) -> Option<char> {
        if self.pos < self.chars.len() {
            let c = self.chars[self.pos];
            self.pos += 1;
            Some(c)
        } else {
            None
        }
    }

    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.chars.len() - self.pos;
        (remaining, Some(remaining))
    }
}

impl<I: Iterator<Item = char>> core::iter::FusedIterator for Decompositions<I> {}

impl<I: Iterator<Item = char> + Clone> fmt::Display for Decompositions<I> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for &c in &self.chars[self.pos..] {
            f.write_str(c.encode_utf8(&mut [0u8; 4]))?;
        }
        Ok(())
    }
}

/// CJK compatibility variant replacement iterator.
///
/// This is intentionally a passthrough: the only caller is the `url` crate's
/// IDNA processing path, which delegates the actual domain-to-ASCII conversion
/// to the JS host (via `host_bridge::domain_to_ascii`).  The host's
/// `URL` / `domainToUnicode` implementation already applies CJK compat variant
/// mapping, so performing it here would be redundant.
pub struct Replacements<I> {
    inner: I,
}

impl<I: Iterator<Item = char>> Replacements<I> {
    #[inline]
    pub fn new_cjk_compat_variants(iter: I) -> Self {
        Replacements { inner: iter }
    }
}

impl<I: Iterator<Item = char>> Iterator for Replacements<I> {
    type Item = char;

    #[inline]
    fn next(&mut self) -> Option<char> {
        self.inner.next()
    }

    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }
}

/// Stream-safe text process iterator (stub -- passthrough).
pub struct StreamSafe<I> {
    inner: I,
}

impl<I: Iterator<Item = char>> StreamSafe<I> {
    #[inline]
    pub fn new(iter: I) -> Self {
        StreamSafe { inner: iter }
    }
}

impl<I: Iterator<Item = char>> Iterator for StreamSafe<I> {
    type Item = char;

    #[inline]
    fn next(&mut self) -> Option<char> {
        self.inner.next()
    }

    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }
}

// ---------------------------------------------------------------------------
// UnicodeNormalization trait
// ---------------------------------------------------------------------------

/// Methods for iterating over strings while applying Unicode normalizations.
pub trait UnicodeNormalization<I: Iterator<Item = char>> {
    /// Returns an iterator over the string in Unicode Normalization Form D.
    fn nfd(self) -> Decompositions<I>;
    /// Returns an iterator over the string in Unicode Normalization Form KD.
    fn nfkd(self) -> Decompositions<I>;
    /// An Iterator over the string in Unicode Normalization Form C.
    fn nfc(self) -> Recompositions<I>;
    /// An Iterator over the string in Unicode Normalization Form KC.
    fn nfkc(self) -> Recompositions<I>;
    /// CJK Compatibility Ideograph replacement.
    fn cjk_compat_variants(self) -> Replacements<I>;
    /// Stream-Safe Text Process.
    fn stream_safe(self) -> StreamSafe<I>;
}

impl<'a> UnicodeNormalization<Chars<'a>> for &'a str {
    #[inline]
    fn nfd(self) -> Decompositions<Chars<'a>> {
        Decompositions::new_canonical(self.chars())
    }
    #[inline]
    fn nfkd(self) -> Decompositions<Chars<'a>> {
        Decompositions::new_compatible(self.chars())
    }
    #[inline]
    fn nfc(self) -> Recompositions<Chars<'a>> {
        Recompositions::new_canonical(self.chars())
    }
    #[inline]
    fn nfkc(self) -> Recompositions<Chars<'a>> {
        Recompositions::new_compatible(self.chars())
    }
    #[inline]
    fn cjk_compat_variants(self) -> Replacements<Chars<'a>> {
        Replacements::new_cjk_compat_variants(self.chars())
    }
    #[inline]
    fn stream_safe(self) -> StreamSafe<Chars<'a>> {
        StreamSafe::new(self.chars())
    }
}

impl UnicodeNormalization<option::IntoIter<char>> for char {
    #[inline]
    fn nfd(self) -> Decompositions<option::IntoIter<char>> {
        Decompositions::new_canonical(Some(self).into_iter())
    }
    #[inline]
    fn nfkd(self) -> Decompositions<option::IntoIter<char>> {
        Decompositions::new_compatible(Some(self).into_iter())
    }
    #[inline]
    fn nfc(self) -> Recompositions<option::IntoIter<char>> {
        Recompositions::new_canonical(Some(self).into_iter())
    }
    #[inline]
    fn nfkc(self) -> Recompositions<option::IntoIter<char>> {
        Recompositions::new_compatible(Some(self).into_iter())
    }
    #[inline]
    fn cjk_compat_variants(self) -> Replacements<option::IntoIter<char>> {
        Replacements::new_cjk_compat_variants(Some(self).into_iter())
    }
    #[inline]
    fn stream_safe(self) -> StreamSafe<option::IntoIter<char>> {
        StreamSafe::new(Some(self).into_iter())
    }
}

impl<I: Iterator<Item = char>> UnicodeNormalization<I> for I {
    #[inline]
    fn nfd(self) -> Decompositions<I> {
        Decompositions::new_canonical(self)
    }
    #[inline]
    fn nfkd(self) -> Decompositions<I> {
        Decompositions::new_compatible(self)
    }
    #[inline]
    fn nfc(self) -> Recompositions<I> {
        Recompositions::new_canonical(self)
    }
    #[inline]
    fn nfkc(self) -> Recompositions<I> {
        Recompositions::new_compatible(self)
    }
    #[inline]
    fn cjk_compat_variants(self) -> Replacements<I> {
        Replacements::new_cjk_compat_variants(self)
    }
    #[inline]
    fn stream_safe(self) -> StreamSafe<I> {
        StreamSafe::new(self)
    }
}

