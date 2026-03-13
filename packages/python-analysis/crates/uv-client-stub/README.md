# uv-client-stub

Minimal local stub for the `uv-client` crate from [uv](https://github.com/astral-sh/uv),
stripped to only the types needed by `uv-requirements-txt` in WASM.

- `Connectivity` -- enum (Online / Offline) for network mode selection
- `BaseClientBuilder` -- builder struct that carries a `Connectivity` value

Everything else (HTTP client, retry logic, authentication, caching, etc.)
has been removed. WASM always runs offline.

Based on uv revision [`35d1e90`](https://github.com/astral-sh/uv/tree/35d1e90961c1c2bd238ee6b015f970c0cf97f5d5/crates/uv-client).
