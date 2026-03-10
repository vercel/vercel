# uv-requirements-txt-lite

Lite extraction of the `uv-requirements-txt` parser from [uv](https://github.com/astral-sh/uv),
providing synchronous `requirements.txt` parsing for `wasm32-wasip2`.

Drops async I/O, HTTP fetching, `uv-client`, `uv-configuration`, and `uv-distribution-types`.
Content is passed as a string; file I/O and recursive `-r`/`-c` handling are left to the
TypeScript caller.

## Upstream

Based on uv revision [`35d1e90`](https://github.com/astral-sh/uv/tree/35d1e90961c1c2bd238ee6b015f970c0cf97f5d5/crates/uv-requirements-txt).

Licensed under MIT OR Apache-2.0.
