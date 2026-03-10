//! Python semantic analyzer.

mod bindings {
    include!(env!("WIT_BINDINGS"));
}
mod dist_metadata;
mod entrypoint;

bindings::export!(PythonAnalyzer with_types_in bindings);

struct PythonAnalyzer;

use crate::bindings::{
    DirectUrlInfo, DistMetadata, ParsedReqEntry, ParsedRequirementsTxt, ParsedVcsInfo, RecordEntry,
};
use crate::entrypoint::{
    contains_app_or_handler_impl, contains_top_level_callable_impl, get_string_constant_impl,
};

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
    ) -> Result<ParsedRequirementsTxt, String> {
        let wd = working_dir.unwrap_or_else(|| "/".to_string());
        let working_dir = std::path::Path::new(&wd);
        let parsed = uv_requirements_txt_lite::parse_requirements_txt(&content, working_dir)?;

        fn convert_entry(e: uv_requirements_txt_lite::ParsedEntry) -> ParsedReqEntry {
            ParsedReqEntry {
                name: e.name,
                pep508: e.pep508,
                extras: e.extras,
                markers: e.markers,
                version_spec: e.version_spec,
                url: e.url,
                hashes: e.hashes,
                editable: e.editable,
                vcs: e.vcs.map(|v| ParsedVcsInfo {
                    url: v.url,
                    rev: v.rev,
                    egg: v.egg,
                }),
                given_url: e.given_url,
            }
        }

        Ok(ParsedRequirementsTxt {
            requirements: parsed.requirements.into_iter().map(convert_entry).collect(),
            editables: parsed.editables.into_iter().map(convert_entry).collect(),
            requirement_files: parsed.requirement_files,
            constraint_files: parsed.constraint_files,
            index_url: parsed.index_url,
            extra_index_urls: parsed.extra_index_urls,
            find_links: parsed.find_links,
            no_index: parsed.no_index,
        })
    }
}
