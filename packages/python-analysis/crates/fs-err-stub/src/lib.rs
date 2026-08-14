// Stubbed fs-err: re-exports std::fs types.
// The real fs-err wraps std::fs with better error messages, but we don't
// need that in WASM. This stub exists solely to satisfy the upstream
// uv-requirements-txt dependency without pulling in tokio.

pub use std::fs::*;
pub use std::io::{Error, ErrorKind};

/// Stub tokio module -- only used in upstream test code, unreachable in WASM.
pub mod tokio {
    pub async fn read(_path: impl AsRef<std::path::Path>) -> std::io::Result<Vec<u8>> {
        panic!("fs-err tokio::read is not supported in WASM; all file I/O must go through the host-bridge")
    }
}
