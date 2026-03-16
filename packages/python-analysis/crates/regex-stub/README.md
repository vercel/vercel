# regex-stub

Local stub for the [`regex`](https://github.com/rust-lang/regex) crate
(v1.10.6) that delegates regex matching to the JS host via WIT imports,
eliminating regex-automata/regex-syntax tables (~795 KB) from the WASM binary.

Pattern compilation and matching are performed by the Node.js `RegExp` engine
via the `vercel:python-analysis/host-utils` WIT interface. Rust `(?P<name>...)`
named group syntax is translated to JS `(?<name>...)` syntax at construction time
on the Rust side.

## API surface

Only the subset used by downstream crates (uv-pep508, uv-pypi-types) is
implemented:

- `Regex::new(pattern) -> Result<Regex, Error>`
- `Regex::replace_all(text, replacer) -> Cow<str>`
- `Captures::name(name) -> Option<Match>`
- `Captures::get(0) -> Option<Match>`
- `Captures[name]`, `Index<&str>`
- `Match::as_str()`, `Match::start()`, `Match::end()`

## Upstream

Based on [`regex` v1.10.6](https://crates.io/crates/regex/1.10.6) from
[rust-lang/regex](https://github.com/rust-lang/regex).

Copyright (c) The Rust Project Developers. Licensed under MIT OR Apache-2.0.
