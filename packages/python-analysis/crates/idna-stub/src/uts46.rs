// Derived from the idna crate (https://github.com/servo/rust-url).
// Copyright (c) The Servo Project Developers.
// Licensed under the Apache License, Version 2.0 or the MIT License.

//! Stub for `idna::uts46` module -- provides `AsciiDenyList` and other types
//! needed by the `url` crate.

/// A deny list of ASCII code points that are rejected during domain-to-ASCII
/// processing.
pub struct AsciiDenyList {
    bits: u128,
}

// Mask for uppercase ASCII letters (A-Z at positions 0x41-0x5A)
const UPPER_CASE_MASK: u128 = {
    let mut mask = 0u128;
    let mut b = b'A';
    while b <= b'Z' {
        mask |= 1u128 << b;
        b += 1;
    }
    mask
};

// Mask for glyphless characters (0x00-0x20 space and below, plus 0x7F DEL)
const GLYPHLESS_MASK: u128 = {
    let mut mask = 0u128;
    let mut b: u8 = 0;
    while b <= 0x20 {
        mask |= 1u128 << b;
        b += 1;
    }
    mask |= 1u128 << 0x7F;
    mask
};

impl AsciiDenyList {
    pub const fn new(deny_glyphless: bool, deny_list: &str) -> Self {
        let mut bits = UPPER_CASE_MASK;
        if deny_glyphless {
            bits |= GLYPHLESS_MASK;
        }
        let bytes = deny_list.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            bits |= 1u128 << bytes[i];
            i += 1;
        }
        Self { bits }
    }

    /// No deny list (_UseSTD3ASCIIRules=false_).
    pub const EMPTY: Self = Self::new(false, "");

    /// The STD3 deny list (_UseSTD3ASCIIRules=true_).
    pub const STD3: Self = Self { bits: ldh_mask() };

    /// Forbidden domain code points from the WHATWG URL Standard.
    pub const URL: Self = Self::new(true, "%#/:<>?@[\\]^|");

    /// Returns true if the given byte is denied.
    pub const fn denies(&self, b: u8) -> bool {
        if b >= 0x80 {
            return false;
        }
        (self.bits >> b) & 1 != 0
    }
}

/// Compute the LDH (letter-digit-hyphen) complement mask for STD3.
/// Denies everything except letters, digits, hyphen, and dot.
const fn ldh_mask() -> u128 {
    let mut mask = 0u128;
    let mut b: u8 = 0;
    loop {
        let is_allowed = (b >= b'a' && b <= b'z')
            || (b >= b'A' && b <= b'Z')
            || (b >= b'0' && b <= b'9')
            || b == b'-'
            || b == b'.';
        if !is_allowed {
            mask |= 1u128 << b;
        }
        if b == 127 {
            break;
        }
        b += 1;
    }
    mask
}

