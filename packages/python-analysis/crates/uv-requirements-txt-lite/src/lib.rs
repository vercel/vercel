//! Lite requirements.txt parser extracted from uv-requirements-txt.
//!
//! Provides synchronous parsing of requirements.txt content.
//! File I/O and recursive `-r`/`-c` handling are left to the caller.

mod parser;
mod shquote;

use std::path::Path;

use unscanny::Scanner;
use uv_distribution_filename::DistFilename;
use uv_git_types::GitUrl;
use uv_pep508::MarkerTree;

use parser::{RequirementsTxtRequirement, RequirementsTxtStatement, parse_entry};

/// Parsed VCS (Git) URL information.
#[derive(Debug, Clone)]
pub struct ParsedVcsInfo {
    /// The repository URL (without `git+` prefix, `@ref`, or `#fragment`).
    pub url: String,
    /// The requested revision (branch, tag, or commit hash), if any.
    pub rev: Option<String>,
    /// The `#egg=name` fragment, if any.
    pub egg: Option<String>,
}

/// A parsed entry from a requirements.txt file.
#[derive(Debug, Clone)]
pub struct ParsedEntry {
    /// Package name (None for unnamed/URL-only requirements).
    pub name: Option<String>,
    /// Full PEP 508 string representation.
    pub pep508: String,
    /// Extra features requested.
    pub extras: Vec<String>,
    /// Environment marker string (e.g., `python_version >= "3.8"`).
    pub markers: Option<String>,
    /// Version specifier (e.g., `>=1.0,<2.0`).
    pub version_spec: Option<String>,
    /// Direct URL, if any.
    pub url: Option<String>,
    /// Hash digests (e.g., `sha256:abc123...`).
    pub hashes: Vec<String>,
    /// Whether this is an editable install.
    pub editable: bool,
    /// Parsed VCS (Git) information, if this is a `git+` URL.
    pub vcs: Option<ParsedVcsInfo>,
    /// The URL/path as originally written by the user (before resolution).
    pub given_url: Option<String>,
}

/// Result of parsing a requirements.txt file.
#[derive(Debug, Clone, Default)]
pub struct ParsedRequirements {
    /// Regular requirements.
    pub requirements: Vec<ParsedEntry>,
    /// Editable requirements (`-e`).
    pub editables: Vec<ParsedEntry>,
    /// Files referenced via `-r` (for the caller to handle recursion).
    pub requirement_files: Vec<String>,
    /// Files referenced via `-c`.
    pub constraint_files: Vec<String>,
    /// Primary index URL (`--index-url`).
    pub index_url: Option<String>,
    /// Extra index URLs (`--extra-index-url`).
    pub extra_index_urls: Vec<String>,
    /// Find-links locations (`--find-links`).
    pub find_links: Vec<String>,
    /// Whether `--no-index` was specified.
    pub no_index: bool,
}

/// Parse requirements.txt content into structured data.
///
/// `working_dir` is used for resolving relative paths in URL requirements.
/// File I/O for `-r`/`-c` references is NOT performed; the referenced filenames
/// are returned in `requirement_files` / `constraint_files` for the caller to handle.
pub fn parse_requirements_txt(
    content: &str,
    working_dir: &Path,
) -> Result<ParsedRequirements, String> {
    let mut result = ParsedRequirements::default();
    let mut scanner = Scanner::new(content);

    loop {
        let entry = parse_entry(&mut scanner, content, working_dir).map_err(|e| e.to_string())?;

        let Some(entry) = entry else {
            break;
        };

        match entry {
            RequirementsTxtStatement::Requirements { filename } => {
                result.requirement_files.push(filename);
            }
            RequirementsTxtStatement::Constraint { filename } => {
                result.constraint_files.push(filename);
            }
            RequirementsTxtStatement::RequirementEntry(entry) => {
                result.requirements.push(convert_entry(entry, false));
            }
            RequirementsTxtStatement::EditableRequirementEntry(entry) => {
                result.editables.push(convert_entry(entry, true));
            }
            RequirementsTxtStatement::IndexUrl(url) => {
                result.index_url = Some(url);
            }
            RequirementsTxtStatement::ExtraIndexUrl(url) => {
                result.extra_index_urls.push(url);
            }
            RequirementsTxtStatement::FindLinks(url) => {
                result.find_links.push(url);
            }
            RequirementsTxtStatement::NoIndex => {
                result.no_index = true;
            }
            RequirementsTxtStatement::NoBinary
            | RequirementsTxtStatement::OnlyBinary
            | RequirementsTxtStatement::UnsupportedOption => {
                // Silently skip
            }
        }
    }

    Ok(result)
}

/// Convert an internal `RequirementEntry` into the public `ParsedEntry`.
fn convert_entry(entry: parser::RequirementEntry, editable: bool) -> ParsedEntry {
    let pep508 = entry.requirement.to_string();

    match entry.requirement {
        RequirementsTxtRequirement::Named(req) => {
            let name = Some(req.name.to_string());
            let extras: Vec<String> = req.extras.iter().map(|e| e.to_string()).collect();

            let markers = format_markers(req.marker);

            let (version_spec, url, vcs, given_url) = match &req.version_or_url {
                Some(uv_pep508::VersionOrUrl::VersionSpecifier(vs)) => {
                    let spec = vs.to_string();
                    (if spec.is_empty() { None } else { Some(spec) }, None, None, None)
                }
                Some(uv_pep508::VersionOrUrl::Url(u)) => {
                    let url_str = u.to_string();
                    let vcs = parse_git_url(&url_str);
                    let given = u.given().map(String::from);
                    (None, Some(url_str), vcs, given)
                }
                None => (None, None, None, None),
            };

            ParsedEntry {
                name,
                pep508,
                extras,
                markers,
                version_spec,
                url,
                hashes: entry.hashes,
                editable,
                vcs,
                given_url,
            }
        }
        RequirementsTxtRequirement::Unnamed(req) => {
            let extras: Vec<String> = req.extras.iter().map(|e| e.to_string()).collect();
            let markers = format_markers(req.marker);
            let given_url = req.url.given().map(String::from);
            let url_str = req.url.to_string();
            let (name, version_spec) = extract_name_and_version_from_url(&url_str);
            let vcs = parse_git_url(&url_str);

            ParsedEntry {
                name,
                pep508,
                extras,
                markers,
                version_spec,
                url: Some(url_str),
                hashes: entry.hashes,
                editable,
                vcs,
                given_url,
            }
        }
    }
}

/// Format a `MarkerTree` to its string representation, or `None` if always true.
fn format_markers(marker: MarkerTree) -> Option<String> {
    marker.try_to_string()
}

/// Extract a package name and version from a URL pointing to a wheel or sdist file.
///
/// Uses `uv-distribution-filename` to parse wheel and source distribution filenames.
/// Returns `(None, None)` for directories or unrecognizable filenames.
fn extract_name_and_version_from_url(url: &str) -> (Option<String>, Option<String>) {
    // Extract the filename from the URL path
    let path = url.strip_prefix("file://").unwrap_or(url);
    let filename = path.rsplit('/').next().unwrap_or("");

    if filename.is_empty() || filename == "." || filename == ".." {
        return (None, None);
    }

    // Use uv-distribution-filename to parse wheel and sdist filenames
    match DistFilename::try_from_normalized_filename(filename) {
        Some(dist) => (
            Some(dist.name().to_string()),
            Some(format!("=={}", dist.version())),
        ),
        None => (None, None),
    }
}

/// Parse a `git+` URL into structured VCS info using `uv-git-types`.
///
/// Extracts the repository URL, revision reference, and `#egg=name` fragment.
/// Returns `None` if the URL is not a `git+` URL or fails to parse.
fn parse_git_url(url: &str) -> Option<ParsedVcsInfo> {
    let without_prefix = url.strip_prefix("git+")?;

    // Extract egg name from fragment before parsing
    let egg = url
        .find('#')
        .map(|idx| &url[idx + 1..])
        .and_then(|fragment| {
            fragment
                .split('&')
                .find_map(|part| part.strip_prefix("egg="))
                .map(String::from)
        });

    // Parse the URL (without git+ prefix) using uv-git-types.
    // GitUrl::try_from takes a DisplaySafeUrl which implements From<Url>.
    let parsed_url = url::Url::parse(without_prefix).ok()?;
    let git_url = GitUrl::try_from(uv_redacted::DisplaySafeUrl::from(parsed_url)).ok()?;

    let rev = git_url.reference().as_str().map(String::from);

    Some(ParsedVcsInfo {
        url: git_url.repository().to_string(),
        rev,
        egg,
    })
}
