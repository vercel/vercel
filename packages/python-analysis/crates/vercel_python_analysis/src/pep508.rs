//! PEP 508 dependency string parsing via `uv-pep508`.
//!
//! This module provides direct parsing of individual PEP 508 dependency
//! specifiers without the overhead of the full requirements.txt machinery.

use std::str::FromStr;

use crate::bindings::{ParsedReqEntry, ParsedVcsInfo};

/// Extract VCS (Git) information from a parsed URL.
pub(crate) fn extract_vcs_info(parsed_url: &uv_pypi_types::ParsedUrl) -> Option<ParsedVcsInfo> {
    match parsed_url {
        uv_pypi_types::ParsedUrl::Git(git) => {
            let url = git.url.repository().to_string();
            let rev = git.url.reference().as_str().map(String::from);
            Some(ParsedVcsInfo { url, rev })
        }
        _ => None,
    }
}

/// Convert a `uv_pep508::VersionOrUrl` into its component parts:
/// `(version_spec, url, editable, vcs, given_url)`.
pub(crate) fn convert_version_or_url(
    version_or_url: &Option<uv_pep508::VersionOrUrl<uv_pypi_types::VerbatimParsedUrl>>,
) -> (Option<String>, Option<String>, bool, Option<ParsedVcsInfo>, Option<String>) {
    match version_or_url {
        Some(uv_pep508::VersionOrUrl::VersionSpecifier(spec)) => {
            (Some(spec.to_string()), None, false, None, None)
        }
        Some(uv_pep508::VersionOrUrl::Url(verbatim_url)) => {
            let given = verbatim_url.verbatim.given().map(String::from);
            let url_str = verbatim_url.verbatim.to_string();
            let editable = verbatim_url.parsed_url.is_editable();
            let vcs = extract_vcs_info(&verbatim_url.parsed_url);
            (None, Some(url_str), editable, vcs, given)
        }
        None => (None, None, false, None, None),
    }
}

/// Parse a single PEP 508 dependency string directly using `uv-pep508`.
///
/// This is much lighter than `parse_requirements_txt` because it avoids
/// the `uv-requirements-txt` machinery (client builder, cache, file I/O).
pub(crate) fn parse_pep508(dep: &str) -> Result<ParsedReqEntry, String> {
    let req = uv_pep508::Requirement::<uv_pypi_types::VerbatimParsedUrl>::from_str(dep)
        .map_err(|e| e.to_string())?;

    let pep508 = req.to_string();
    let name = Some(req.name.to_string());
    let extras: Vec<String> = req.extras.iter().map(|e| e.to_string()).collect();
    let markers = req.marker.contents().map(|m| m.to_string());
    let (version_spec, url, editable, vcs, given_url) = convert_version_or_url(&req.version_or_url);

    Ok(ParsedReqEntry {
        name,
        pep508,
        extras,
        markers,
        version_spec,
        url,
        hashes: Vec::new(),
        editable,
        vcs,
        given_url,
    })
}
