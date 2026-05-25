# uv-fs-stub

Minimal local stub for the `uv-fs` crate from [uv](https://github.com/astral-sh/uv),
stripped to only the functions needed by `uv-pep508` and `uv-requirements-txt`.

- `normalize_url_path` -- percent-decodes and normalizes a URL path component
  for use as a file path
- `normalize_absolute_path` -- normalizes an absolute path by resolving `.` and
  `..` components
- `Simplified` trait -- simplified path display (delegates to `.display()` in
  WASM); used by `uv-requirements-txt` for error messages
- `read_to_string_transcode` -- reads a file via host-bridge `read_file`; used
  by `uv-requirements-txt` to read included `-r`/`-c` files

Everything else (async I/O, tokio, filesystem utilities, symlink helpers, etc.)
has been removed.  The `tokio` and `serde` features are kept as no-ops so that
dependents enabling them still compile.

Based on uv revision [`35d1e90`](https://github.com/astral-sh/uv/tree/35d1e90961c1c2bd238ee6b015f970c0cf97f5d5/crates/uv-fs).

Copyright (c) Astral Software Inc. Licensed under Apache-2.0 OR MIT.
