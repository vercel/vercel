// Derived from the uv project (https://github.com/astral-sh/uv).
// Copyright (c) 2023 Astral Software Inc.
// Licensed under the Apache License, Version 2.0 or the MIT License.

use std::borrow::Cow;

use url::Url;
use uv_pep508::UnnamedRequirement;
use uv_pypi_types::VerbatimParsedUrl;

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Could not extract path segments from URL: {0}")]
    MissingPathSegments(String),

    #[error(transparent)]
    Utf8(#[from] std::str::Utf8Error),
}

// ---------------------------------------------------------------------------
// RemoteSource
// ---------------------------------------------------------------------------

/// Return an appropriate filename for a distribution.
///
/// Stub: only the `Url` impl is provided (the only one needed for
/// requirements.txt name inference).
pub trait RemoteSource {
    /// Return an appropriate filename for the distribution.
    fn filename(&self) -> Result<Cow<'_, str>, Error>;

    /// Return the size of the distribution, if known.
    fn size(&self) -> Option<u64>;
}

impl RemoteSource for Url {
    fn filename(&self) -> Result<Cow<'_, str>, Error> {
        // Identify the last segment of the URL as the filename.
        let mut path_segments = self
            .path_segments()
            .ok_or_else(|| Error::MissingPathSegments(self.to_string()))?;

        // This is guaranteed by the contract of `Url::path_segments`.
        let last = path_segments
            .next_back()
            .expect("path segments is non-empty");

        // Decode the filename, which may be percent-encoded.
        let filename = percent_encoding::percent_decode_str(last).decode_utf8()?;

        Ok(filename)
    }

    fn size(&self) -> Option<u64> {
        None
    }
}

// ---------------------------------------------------------------------------
// Requirement types
// ---------------------------------------------------------------------------

/// Wrapper around a PEP 508 requirement.
///
/// Stub: wraps `uv_pep508::Requirement<VerbatimParsedUrl>` directly.
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct Requirement(pub uv_pep508::Requirement<VerbatimParsedUrl>);

impl From<uv_pep508::Requirement<VerbatimParsedUrl>> for Requirement {
    fn from(req: uv_pep508::Requirement<VerbatimParsedUrl>) -> Self {
        Self(req)
    }
}

impl std::fmt::Display for Requirement {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(&self.0, f)
    }
}

/// An unresolved requirement: either named or unnamed.
#[derive(Hash, Debug, Clone, Eq, PartialEq)]
pub enum UnresolvedRequirement {
    /// Named PEP 508 requirement.
    Named(Requirement),
    /// Direct URL dependency without a package name.
    Unnamed(UnnamedRequirement<VerbatimParsedUrl>),
}

/// A requirement with optional hashes.
#[derive(Debug, Clone, Eq, PartialEq, Hash)]
pub struct UnresolvedRequirementSpecification {
    /// The actual requirement.
    pub requirement: UnresolvedRequirement,
    /// Hashes of the downloadable packages.
    pub hashes: Vec<String>,
}
