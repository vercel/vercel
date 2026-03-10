# uv-pypi-types-stub

Local stub for the `uv-pypi-types` crate from [uv](https://github.com/astral-sh/uv),
stripped to only the types used in `python-analysis`.

- `Metadata23` -- PEP 658 / PEP 566 package metadata parsing
- `DirectUrl` -- PEP 610 direct URL metadata (`ArchiveInfo`, `DirInfo`, `VcsInfo`, `VcsKind`)

Heavy dependencies eliminated: `regex`, `rkyv`, `jiff`, `petgraph`, `toml_edit`, `tracing`,
and most `uv-*` crate dependencies.

## Upstream

Based on uv revision [`35d1e90`](https://github.com/astral-sh/uv/tree/35d1e90961c1c2bd238ee6b015f970c0cf97f5d5/crates/uv-pypi-types).

Licensed under MIT OR Apache-2.0.
