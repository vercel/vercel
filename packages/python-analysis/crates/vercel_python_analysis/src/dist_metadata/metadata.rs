//! METADATA file parsing using uv's Metadata23 parser.

use uv_pypi_types::Metadata23;

use crate::bindings::DistMetadata;

/// Parse a METADATA file (Core Metadata 2.3) from raw bytes.
pub(crate) fn parse(content: &[u8]) -> Result<DistMetadata, String> {
    let meta = Metadata23::parse(content).map_err(|e| e.to_string())?;

    // Convert ProjectUrls to list of (label, url) tuples by using the
    // `to_vec_str()` method which returns "label, url" strings.
    let project_urls = meta
        .project_urls
        .to_vec_str()
        .into_iter()
        .map(|s| {
            let (label, url) = s.split_once(", ").unwrap_or((&s, ""));
            (label.to_string(), url.to_string())
        })
        .collect();

    Ok(DistMetadata {
        metadata_version: meta.metadata_version,
        name: meta.name,
        version: meta.version,
        summary: meta.summary,
        description: meta.description,
        description_content_type: meta.description_content_type,
        requires_dist: meta.requires_dist,
        requires_python: meta.requires_python,
        provides_extra: meta.provides_extra,
        author: meta.author,
        author_email: meta.author_email,
        maintainer: meta.maintainer,
        maintainer_email: meta.maintainer_email,
        license: meta.license,
        license_expression: meta.license_expression,
        classifiers: meta.classifiers,
        home_page: meta.home_page,
        project_urls,
        platforms: meta.platforms,
        dynamic: meta.dynamic,
    })
}
