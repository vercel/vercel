# unicode-names2-stub

Stub replacement for the [`unicode_names2`](https://github.com/progval/unicode_names2) 
crate that eliminates ~820 KB of Unicode name lookup tables from the WASM binary.

This crate is pulled in by `ruff_python_parser` for Python's `\N{UNICODE NAME}` string
escape syntax, which is irrelevant for the analyses that we perform.

## API surface

- `name(char) -> Option<Name>` -- always returns `None`
- `character(name) -> Option<char>` -- always returns `U+FFFD` (replacement character)

## Upstream

Based on [`unicode_names2` v1.3.0](https://crates.io/crates/unicode_names2/1.3.0)
from [progval/unicode_names2](https://github.com/progval/unicode_names2).

Licensed under (MIT OR Apache-2.0) AND Unicode-DFS-2016.
