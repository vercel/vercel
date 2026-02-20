//! Package name normalization using uv-normalize.
//!
//! See: https://packaging.python.org/en/latest/specifications/name-normalization/

use std::str::FromStr;

use uv_normalize::PackageName;

/// Normalize a package name per PEP 503.
pub(crate) fn normalize(name: &str) -> String {
    match PackageName::from_str(name) {
        Ok(pkg) => pkg.to_string(),
        // If the name is invalid, return it lowercased as a best-effort fallback.
        Err(_) => name.to_lowercase(),
    }
}
