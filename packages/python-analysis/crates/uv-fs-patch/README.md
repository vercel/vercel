# uv-fs-patch

Minimal local patch for the `uv-fs` crate from [uv](https://github.com/astral-sh/uv),
stripped down to only the two functions needed by `uv-pep508` for `wasm32-wasip2` compilation:

- `normalize_url_path` — percent-decodes and normalizes a URL path component for use as a file path
- `normalize_absolute_path` — normalizes an absolute path by resolving `.` and `..` components

Everything else (async I/O, tokio, filesystem utilities, symlink helpers, etc.) has been removed.
The `tokio` and `serde` features are kept as no-ops so that dependents enabling them still compile.

Based on uv revision [`35d1e90`](https://github.com/astral-sh/uv/tree/35d1e90961c1c2bd238ee6b015f970c0cf97f5d5/crates/uv-fs).
