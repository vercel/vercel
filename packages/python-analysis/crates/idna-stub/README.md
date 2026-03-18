# idna-stub

Local stub for the [`idna`](https://github.com/servo/rust-url/tree/main/idna)
crate (v1.1.0) that replaces ICU-based IDNA processing with a WIT host import,
eliminating ~275 KB of ICU/Unicode lookup tables from the WASM binary.

Domain-to-ASCII conversion is delegated to the JS host via the
`vercel:python-analysis/host-utils` WIT interface, which uses the Node.js `URL`
API internally. This means the runtime behavior follows IDNA2008 (via
Node.js/ICU) rather than UTS #46 (as in the upstream crate).

## API surface

Only the subset of `idna` used by the [`url`](https://crates.io/crates/url)
crate is implemented:

- `domain_to_ascii_from_cow(domain, deny_list) -> Result<Cow<str>, Errors>`
- `domain_to_unicode(domain) -> (String, Result<(), Errors>)` -- passthrough, no
  round-trip decoding
- `AsciiDenyList` -- `URL`, `STD3`, `EMPTY` variants

Fast paths avoid host calls for all-ASCII lowercase domains.

## Upstream

Based on [`idna` v1.1.0](https://crates.io/crates/idna/1.1.0) from
[servo/rust-url](https://github.com/servo/rust-url/).

Copyright (c) The Servo Project Developers. Licensed under MIT OR Apache-2.0.
