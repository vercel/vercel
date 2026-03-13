//! requirements.txt parsing via `uv-requirements-txt`.

use std::path::PathBuf;

use crate::bindings::{ParsedReqEntry, ParsedRequirementsTxt, ParsedVcsInfo};
use crate::block_on;

pub(crate) fn parse_requirements_txt(
    content: &str,
    working_dir: Option<String>,
    filename: Option<String>,
) -> Result<ParsedRequirementsTxt, String> {
    let wd = working_dir.unwrap_or_else(|| "/".to_string());
    let working_dir = std::path::Path::new(&wd);
    let fname = filename.unwrap_or_else(|| "requirements.txt".to_string());
    let path = PathBuf::from(&wd).join(&fname);

    let client_builder = uv_client::BaseClientBuilder::default()
        .connectivity(uv_client::Connectivity::Offline);
    let mut cache = rustc_hash::FxHashMap::default();

    let parsed = block_on(uv_requirements_txt::RequirementsTxt::parse_str(
        content,
        &path,
        working_dir,
        &client_builder,
        &mut cache,
    ))
    .map_err(|e| e.to_string())?;

    Ok(ParsedRequirementsTxt {
        requirements: parsed
            .requirements
            .into_iter()
            .map(convert_entry)
            .collect(),
        editables: parsed.editables.into_iter().map(convert_entry).collect(),
        index_url: parsed.index_url.map(|u| u.to_string()),
        extra_index_urls: parsed
            .extra_index_urls
            .into_iter()
            .map(|u| u.to_string())
            .collect(),
        find_links: parsed
            .find_links
            .into_iter()
            .map(|u| u.to_string())
            .collect(),
        no_index: parsed.no_index,
    })
}

/// Intermediate struct for `convert_requirement` output.
struct ConvertedReq {
    pep508: String,
    name: Option<String>,
    extras: Vec<String>,
    markers: Option<String>,
    version_spec: Option<String>,
    url: Option<String>,
    editable: bool,
    vcs: Option<ParsedVcsInfo>,
    given_url: Option<String>,
}

fn convert_entry(e: uv_requirements_txt::RequirementEntry) -> ParsedReqEntry {
    let r = convert_requirement(&e.requirement);
    ParsedReqEntry {
        name: r.name,
        pep508: r.pep508,
        extras: r.extras,
        markers: r.markers,
        version_spec: r.version_spec,
        url: r.url,
        hashes: e.hashes,
        editable: r.editable,
        vcs: r.vcs,
        given_url: r.given_url,
    }
}

fn convert_requirement(
    req: &uv_requirements_txt::RequirementsTxtRequirement,
) -> ConvertedReq {
    match req {
        uv_requirements_txt::RequirementsTxtRequirement::Named(named) => {
            let pep508 = named.to_string();
            let name = Some(named.name.to_string());
            let extras: Vec<String> = named.extras.iter().map(|e| e.to_string()).collect();
            let markers = named.marker.contents().map(|m| m.to_string());
            let (version_spec, url, editable, vcs, given_url) = match &named.version_or_url {
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
            };
            ConvertedReq {
                pep508,
                name,
                extras,
                markers,
                version_spec,
                url,
                editable,
                vcs,
                given_url,
            }
        }
        uv_requirements_txt::RequirementsTxtRequirement::Unnamed(unnamed) => {
            let pep508 = unnamed.to_string();
            let extras: Vec<String> = unnamed.extras.iter().map(|e| e.to_string()).collect();
            let markers = unnamed.marker.contents().map(|m| m.to_string());
            let given = unnamed.url.verbatim.given().map(String::from);
            let url_str = unnamed.url.verbatim.to_string();
            let editable = unnamed.url.parsed_url.is_editable();
            let vcs = extract_vcs_info(&unnamed.url.parsed_url);

            // Extract name and version from the URL filename (wheel or sdist),
            // mirroring uv's NamedRequirementsResolver stages 1 & 2.
            let (name, version_spec) = extract_name_version_from_url(&unnamed.url.verbatim);

            ConvertedReq {
                pep508,
                name,
                extras,
                markers,
                version_spec,
                url: Some(url_str),
                editable,
                vcs,
                given_url: given,
            }
        }
    }
}

fn extract_vcs_info(parsed_url: &uv_pypi_types::ParsedUrl) -> Option<ParsedVcsInfo> {
    match parsed_url {
        uv_pypi_types::ParsedUrl::Git(git) => {
            let url = git.url.repository().to_string();
            let rev = git.url.reference().as_str().map(String::from);
            Some(ParsedVcsInfo { url, rev })
        }
        _ => None,
    }
}

/// Extract name and version from a URL filename (wheel or sdist),
/// mirroring uv's `NamedRequirementsResolver` stages 1 & 2.
fn extract_name_version_from_url(
    url: &uv_pep508::VerbatimUrl,
) -> (Option<String>, Option<String>) {
    use uv_distribution_types::RemoteSource;

    // Stage 1: wheel filename (e.g. `anyio-4.3.0-py3-none-any.whl`)
    if std::path::Path::new(url.path())
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("whl"))
    {
        if let Ok(filename) = url.filename() {
            if let Ok(wheel) = filename.parse::<uv_distribution_filename::WheelFilename>() {
                let name = uv_normalize::PackageName::to_string(&wheel.name);
                let version = format!("=={}", wheel.version);
                return (Some(name), Some(version));
            }
        }
    }

    // Stage 2: source dist filename (e.g. `anyio-4.3.0.tar.gz`)
    if let Some(sdist) = url
        .filename()
        .ok()
        .and_then(|filename| {
            uv_distribution_filename::SourceDistFilename::parsed_normalized_filename(&filename).ok()
        })
    {
        // Skip GitHub archives with auto-generated filenames (e.g.
        // `https://github.com/user/repo/archive/refs/heads/main.tar.gz`)
        let is_github_archive = url.host() == Some(url::Host::Domain("github.com"))
            && url
                .path_segments()
                .is_some_and(|mut segments| segments.any(|s| s == "archive"));
        if !is_github_archive {
            let name = uv_normalize::PackageName::to_string(&sdist.name);
            let version = format!("=={}", sdist.version);
            return (Some(name), Some(version));
        }
    }

    (None, None)
}
