//! Installed package distribution metadata parsing.
//!
//! Parses `.dist-info` metadata files (METADATA, RECORD, direct_url.json)
//! using uv's parsing crates for correctness.

pub(crate) mod direct_url;
pub(crate) mod metadata;
pub(crate) mod normalize;
pub(crate) mod record;
