# uv-configuration-stub

Minimal local stub for the `uv-configuration` crate from [uv](https://github.com/astral-sh/uv),
stripped to only the types needed by `uv-requirements-txt`.

- `PackageNameSpecifier` -- enum for `:all:`, `:none:`, or a specific package name
- `NoBinary` -- whether to disallow wheel installations (`--no-binary`)
- `NoBuild` -- whether to disallow source builds (`--only-binary`)

These types are used by `uv-requirements-txt` to parse `--no-binary` and
`--only-binary` pip arguments. The parsed values are not surfaced to the
host — they exist only to satisfy the upstream parser's type requirements.

Based on uv revision [`35d1e90`](https://github.com/astral-sh/uv/tree/35d1e90961c1c2bd238ee6b015f970c0cf97f5d5/crates/uv-configuration).

Copyright (c) Astral Software Inc. Licensed under Apache-2.0 OR MIT.
