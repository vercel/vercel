#[cfg(target_arch = "wasm32")]
mod bindings {
    include!(env!("WIT_BINDINGS"));
}

#[cfg(target_arch = "wasm32")]
pub use bindings::vercel::python_analysis::host_utils::*;

// Native stub functions generated from the WIT file that `unimplemented!()`
// at runtime. These exist so that the stub crates compile on native targets
// for `--features upstream` testing, where the host-bridge functions are
// never actually called (the real upstream crate handles everything).
#[cfg(not(target_arch = "wasm32"))]
include!(env!("NATIVE_STUBS_PATH"));
