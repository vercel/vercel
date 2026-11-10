# unicode-normalization-stub

Local stub for the [`unicode-normalization`](https://github.com/unicode-rs/unicode-normalization)
crate that replaces ~180 KB of NFC/NFD/NFKC/NFKD decomposition/composition
tables with WIT host imports delegating to JavaScript's `String.prototype.normalize()`.

## API surface

Implements the `UnicodeNormalization` trait with all four normalization forms:

- `.nfc()`, `.nfd()`, `.nfkc()`, `.nfkd()` -- return iterators over normalized characters
- `.cjk_compat_variants()`, `.stream_safe()` -- passthrough (required by trait)

## Upstream

Based on [`unicode-normalization` v0.1.25](https://crates.io/crates/unicode-normalization/0.1.25)
from [unicode-rs/unicode-normalization](https://github.com/unicode-rs/unicode-normalization).

Copyright (c) The Rust Project Developers. Licensed under MIT OR Apache-2.0.
