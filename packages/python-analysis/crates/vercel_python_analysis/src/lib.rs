//! Python semantic analyzer.

mod bindings {
    include!(env!("WIT_BINDINGS"));
}
mod dist_metadata;
mod entrypoint;
mod requirements_txt;

bindings::export!(PythonAnalyzer with_types_in bindings);

struct PythonAnalyzer;

use std::future::Future;
use std::pin::pin;
use std::task::{Context, Poll, Waker};

use crate::bindings::{DirectUrlInfo, DistMetadata, ParsedRequirementsTxt, RecordEntry};
use crate::entrypoint::{
    contains_app_or_handler_impl, contains_top_level_callable_impl, get_string_constant_impl,
};

/// Single-poll executor for WASM: all stub I/O resolves synchronously via host-bridge,
/// so the future is guaranteed to be ready on the first poll.
fn block_on<F: Future>(fut: F) -> F::Output {
    let mut fut = pin!(fut);
    let waker = Waker::noop();
    let mut cx = Context::from_waker(&waker);
    match fut.as_mut().poll(&mut cx) {
        Poll::Ready(val) => val,
        Poll::Pending => panic!("unexpected Pending future in WASM block_on: all I/O must be synchronous via host-bridge"),
    }
}

impl crate::bindings::Guest for PythonAnalyzer {
    /// Check if Python source code contains or exports:
    /// - A top-level 'app' callable (e.g., Flask, FastAPI, Sanic apps)
    /// - A top-level 'application' callable (e.g., Django)
    /// - A top-level 'handler' class (e.g., BaseHTTPRequestHandler subclass)
    ///
    /// Returns true if found, false otherwise.
    /// Returns false for invalid Python syntax.
    fn contains_app_or_handler(source: String) -> bool {
        contains_app_or_handler_impl(&source)
    }

    /// Check if a top-level callable with the given name exists in Python source.
    ///
    /// Returns true if found, false otherwise.
    /// Returns false for invalid Python syntax.
    fn contains_top_level_callable(source: String, name: String) -> bool {
        contains_top_level_callable_impl(&source, &name)
    }

    /// Extract the string value of a top-level constant with the given name.
    /// Only considers simple assignments (`NAME = "string"`) and annotated assignments
    /// (`NAME: str = "string"`) at module level. Returns the first matching string
    /// value, or None if not found or the value is not a string literal.
    fn get_string_constant(source: String, name: String) -> Option<String> {
        get_string_constant_impl(&source, &name)
    }

    fn parse_dist_metadata(content: Vec<u8>) -> Result<DistMetadata, String> {
        dist_metadata::metadata::parse(&content)
    }

    fn parse_record(content: String) -> Result<Vec<RecordEntry>, String> {
        dist_metadata::record::parse(&content)
    }

    fn parse_direct_url(content: String) -> Result<DirectUrlInfo, String> {
        dist_metadata::direct_url::parse(&content)
    }

    fn normalize_package_name(name: String) -> String {
        dist_metadata::normalize::normalize(&name)
    }

    fn parse_requirements_txt(
        content: String,
        working_dir: Option<String>,
        filename: Option<String>,
    ) -> Result<ParsedRequirementsTxt, String> {
        requirements_txt::parse_requirements_txt(&content, working_dir, filename)
    }

    fn is_wheel_compatible(
        wheel_filename: String,
        python_major: u8,
        python_minor: u8,
        os_name: String,
        arch_name: String,
        os_major: u16,
        os_minor: u16,
    ) -> Result<bool, String> {
        use std::str::FromStr;
        use uv_distribution_filename::WheelFilename;
        use uv_platform_tags::{Arch, Os, Platform, Tags};

        let wheel = WheelFilename::from_str(&wheel_filename)
            .map_err(|e| format!("invalid wheel filename: {e}"))?;

        let arch = Arch::from_str(&arch_name)
            .map_err(|e| format!("unknown architecture '{arch_name}': {e}"))?;

        let os = match os_name.as_str() {
            "manylinux" => Os::Manylinux {
                major: os_major,
                minor: os_minor,
            },
            "musllinux" => Os::Musllinux {
                major: os_major,
                minor: os_minor,
            },
            "macos" => Os::Macos {
                major: os_major,
                minor: os_minor,
            },
            "windows" => Os::Windows,
            other => return Err(format!("unknown OS '{other}': expected manylinux, musllinux, macos, or windows")),
        };

        let platform = Platform::new(os, arch);
        let python_version = (python_major, python_minor);

        let tags = Tags::from_env(
            &platform,
            python_version,
            "cpython",
            python_version,
            true,  // manylinux_compatible
            false, // gil_disabled
            false, // is_cross
        )
        .map_err(|e| format!("failed to build platform tags: {e}"))?;

        Ok(wheel.is_compatible(&tags))
    }
}
