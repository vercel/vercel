//! Vendored from <https://github.com/PyO3/python-pkginfo-rs>
use std::fmt::Display;
use std::fmt::Write;
use std::str;
use std::str::{FromStr, Utf8Error};

use indexmap::IndexMap;
use thiserror::Error;

/// <https://github.com/PyO3/python-pkginfo-rs/blob/d719988323a0cfea86d4737116d7917f30e819e2/src/error.rs>
///
/// The error type
#[derive(Error, Debug)]
pub enum MetadataError {
    #[error("Invalid header: {0}")]
    InvalidHeader(String),
    #[error("Metadata field {0} not found")]
    FieldNotFound(&'static str),
    #[error("The description is not valid utf-8")]
    DescriptionEncoding(#[source] Utf8Error),
    #[error("Invalid `Metadata-Version` field: {0}")]
    InvalidMetadataVersion(String),
}

/// A parsed RFC 822-style header: (name, value).
#[derive(Debug)]
struct Headers {
    headers: Vec<(String, String)>,
    body_start: usize,
}

impl Headers {
    /// Parse RFC 822-style headers from the given metadata file content.
    fn parse(content: &[u8]) -> Result<Self, MetadataError> {
        let text = str::from_utf8(content)
            .map_err(|e| MetadataError::InvalidHeader(format!("invalid utf-8: {e}")))?;

        // Find the blank line separating headers from body.
        let (header_section, body_start) = if let Some(pos) = text.find("\n\n") {
            (&text[..pos], pos + 2)
        } else if let Some(pos) = text.find("\r\n\r\n") {
            (&text[..pos], pos + 4)
        } else {
            (text, text.len())
        };

        let mut headers: Vec<(String, String)> = Vec::new();

        for line in header_section.lines() {
            if line.starts_with(' ') || line.starts_with('\t') {
                // Continuation line: append to the last header value.
                if let Some(last) = headers.last_mut() {
                    last.1.push('\n');
                    last.1.push_str(line.trim());
                }
            } else if let Some((name, value)) = line.split_once(':') {
                headers.push((name.trim().to_string(), value.trim().to_string()));
            }
            // Skip lines that are neither continuations nor valid headers.
        }

        Ok(Self {
            headers,
            body_start,
        })
    }

    /// Return the first value associated with the header with the given name (case-insensitive).
    fn get_first_value(&self, name: &str) -> Option<String> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.clone())
            .filter(|v| v != "UNKNOWN")
    }

    /// Return all values associated with the header with the given name (case-insensitive).
    fn get_all_values<'a>(&'a self, name: &'a str) -> impl Iterator<Item = String> + 'a {
        self.headers
            .iter()
            .filter(move |(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.clone())
            .filter(move |v| v != "UNKNOWN")
    }
}

/// Core Metadata 2.3 as specified in
/// <https://packaging.python.org/specifications/core-metadata/>.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Metadata23 {
    pub metadata_version: String,
    pub name: String,
    pub version: String,
    pub platforms: Vec<String>,
    pub supported_platforms: Vec<String>,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub description_content_type: Option<String>,
    pub keywords: Option<Keywords>,
    pub home_page: Option<String>,
    pub download_url: Option<String>,
    pub author: Option<String>,
    pub author_email: Option<String>,
    pub maintainer: Option<String>,
    pub maintainer_email: Option<String>,
    pub license: Option<String>,
    pub license_expression: Option<String>,
    pub license_files: Vec<String>,
    pub classifiers: Vec<String>,
    pub requires_dist: Vec<String>,
    pub provides_dist: Vec<String>,
    pub obsoletes_dist: Vec<String>,
    pub requires_python: Option<String>,
    pub requires_external: Vec<String>,
    pub project_urls: ProjectUrls,
    pub provides_extra: Vec<String>,
    pub dynamic: Vec<String>,
}

impl Metadata23 {
    /// Parse distribution metadata from metadata `MetadataError`
    pub fn parse(content: &[u8]) -> Result<Self, MetadataError> {
        let headers = Headers::parse(content)?;

        let metadata_version = headers
            .get_first_value("Metadata-Version")
            .ok_or(MetadataError::FieldNotFound("Metadata-Version"))?;
        let name = headers
            .get_first_value("Name")
            .ok_or(MetadataError::FieldNotFound("Name"))?;
        let version = headers
            .get_first_value("Version")
            .ok_or(MetadataError::FieldNotFound("Version"))?;
        let platforms = headers.get_all_values("Platform").collect();
        let supported_platforms = headers.get_all_values("Supported-Platform").collect();
        let summary = headers.get_first_value("Summary");
        let body = str::from_utf8(&content[headers.body_start..])
            .map_err(MetadataError::DescriptionEncoding)?;
        let description = if body.trim().is_empty() {
            headers.get_first_value("Description")
        } else {
            Some(body.to_string())
        };
        let keywords = headers
            .get_first_value("Keywords")
            .as_deref()
            .map(Keywords::from_metadata);
        let home_page = headers.get_first_value("Home-Page");
        let download_url = headers.get_first_value("Download-URL");
        let author = headers.get_first_value("Author");
        let author_email = headers.get_first_value("Author-email");
        let license = headers.get_first_value("License");
        let license_expression = headers.get_first_value("License-Expression");
        let license_files = headers.get_all_values("License-File").collect();
        let classifiers = headers.get_all_values("Classifier").collect();
        let requires_dist = headers.get_all_values("Requires-Dist").collect();
        let provides_dist = headers.get_all_values("Provides-Dist").collect();
        let obsoletes_dist = headers.get_all_values("Obsoletes-Dist").collect();
        let maintainer = headers.get_first_value("Maintainer");
        let maintainer_email = headers.get_first_value("Maintainer-email");
        let requires_python = headers.get_first_value("Requires-Python");
        let requires_external = headers.get_all_values("Requires-External").collect();
        let project_urls = ProjectUrls::from_iter_str(headers.get_all_values("Project-URL"));
        let provides_extra = headers.get_all_values("Provides-Extra").collect();
        let description_content_type = headers.get_first_value("Description-Content-Type");
        let dynamic = headers.get_all_values("Dynamic").collect();
        Ok(Self {
            metadata_version,
            name,
            version,
            platforms,
            supported_platforms,
            summary,
            description,
            description_content_type,
            keywords,
            home_page,
            download_url,
            author,
            author_email,
            maintainer,
            maintainer_email,
            license,
            license_expression,
            license_files,
            classifiers,
            requires_dist,
            provides_dist,
            obsoletes_dist,
            requires_python,
            requires_external,
            project_urls,
            provides_extra,
            dynamic,
        })
    }

    /// Convert to the pseudo-email format used by Python's METADATA.
    pub fn core_metadata_format(&self) -> String {
        fn write_str(writer: &mut String, key: &str, value: impl Display) {
            let value = value.to_string();
            let mut lines = value.lines();
            if let Some(line) = lines.next() {
                let _ = writeln!(writer, "{key}: {line}");
            } else {
                let _ = writeln!(writer, "{key}: ");
            }
            for line in lines {
                let _ = writeln!(writer, "{}{}", " ".repeat(key.len() + 2), line);
            }
        }
        fn write_opt_str(writer: &mut String, key: &str, value: Option<&impl Display>) {
            if let Some(value) = value {
                write_str(writer, key, value);
            }
        }
        fn write_all(
            writer: &mut String,
            key: &str,
            values: impl IntoIterator<Item = impl Display>,
        ) {
            for value in values {
                write_str(writer, key, value);
            }
        }

        let mut writer = String::new();
        write_str(&mut writer, "Metadata-Version", &self.metadata_version);
        write_str(&mut writer, "Name", &self.name);
        write_str(&mut writer, "Version", &self.version);
        write_all(&mut writer, "Platform", &self.platforms);
        write_all(&mut writer, "Supported-Platform", &self.supported_platforms);
        write_all(&mut writer, "Summary", &self.summary);
        write_opt_str(
            &mut writer,
            "Keywords",
            self.keywords.as_ref().map(Keywords::as_metadata).as_ref(),
        );
        write_opt_str(&mut writer, "Home-Page", self.home_page.as_ref());
        write_opt_str(&mut writer, "Download-URL", self.download_url.as_ref());
        write_opt_str(&mut writer, "Author", self.author.as_ref());
        write_opt_str(&mut writer, "Author-email", self.author_email.as_ref());
        write_opt_str(&mut writer, "License", self.license.as_ref());
        write_opt_str(
            &mut writer,
            "License-Expression",
            self.license_expression.as_ref(),
        );
        write_all(&mut writer, "License-File", &self.license_files);
        write_all(&mut writer, "Classifier", &self.classifiers);
        write_all(&mut writer, "Requires-Dist", &self.requires_dist);
        write_all(&mut writer, "Provides-Dist", &self.provides_dist);
        write_all(&mut writer, "Obsoletes-Dist", &self.obsoletes_dist);
        write_opt_str(&mut writer, "Maintainer", self.maintainer.as_ref());
        write_opt_str(
            &mut writer,
            "Maintainer-email",
            self.maintainer_email.as_ref(),
        );
        write_opt_str(
            &mut writer,
            "Requires-Python",
            self.requires_python.as_ref(),
        );
        write_all(&mut writer, "Requires-External", &self.requires_external);
        write_all(&mut writer, "Project-URL", self.project_urls.to_vec_str());
        write_all(&mut writer, "Provides-Extra", &self.provides_extra);
        write_opt_str(
            &mut writer,
            "Description-Content-Type",
            self.description_content_type.as_ref(),
        );
        write_all(&mut writer, "Dynamic", &self.dynamic);

        if let Some(description) = &self.description {
            writer.push('\n');
            writer.push_str(description);
        }
        writer
    }
}

impl FromStr for Metadata23 {
    type Err = MetadataError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::parse(s.as_bytes())
    }
}

/// Handle the different keywords representation between `METADATA` and `METADATA.json`.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Keywords(Vec<String>);

impl Keywords {
    pub fn new(keywords: Vec<String>) -> Self {
        Self(keywords)
    }

    /// Read the `METADATA` format.
    pub fn from_metadata(keywords: &str) -> Self {
        Self(keywords.split(',').map(ToString::to_string).collect())
    }

    /// Write the `METADATA` format.
    pub fn as_metadata(&self) -> String {
        let mut keywords = self.0.iter();
        let mut rendered = String::new();
        if let Some(keyword) = keywords.next() {
            rendered.push_str(keyword);
        }
        for keyword in keywords {
            rendered.push(',');
            rendered.push_str(keyword);
        }
        rendered
    }
}

/// Handle the different project URLs representation between `METADATA` and `METADATA.json`.
#[derive(Debug, Default, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ProjectUrls(IndexMap<String, String>);

impl ProjectUrls {
    pub fn new(project_urls: IndexMap<String, String>) -> Self {
        Self(project_urls)
    }

    /// Read the `METADATA` format.
    pub fn from_iter_str(project_urls: impl IntoIterator<Item = String>) -> Self {
        Self(
            project_urls
                .into_iter()
                .map(|project_url| {
                    let (label, url) = project_url.split_once(',').unwrap_or((&project_url, ""));
                    (label.trim().to_string(), url.trim().to_string())
                })
                .collect(),
        )
    }

    /// Write the `METADATA` format.
    pub fn to_vec_str(&self) -> Vec<String> {
        self.0
            .iter()
            .map(|(label, url)| format!("{label}, {url}"))
            .collect()
    }
}
