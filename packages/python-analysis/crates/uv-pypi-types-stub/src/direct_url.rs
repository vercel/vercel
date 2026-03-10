use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// Metadata for a distribution that was installed via a direct URL.
///
/// See: <https://packaging.python.org/en/latest/specifications/direct-url-data-structure/>
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", untagged)]
pub enum DirectUrl {
    /// The direct URL is a local directory.
    LocalDirectory {
        url: String,
        dir_info: DirInfo,
        #[serde(skip_serializing_if = "Option::is_none")]
        subdirectory: Option<Box<Path>>,
    },
    /// The direct URL is a path to an archive.
    ArchiveUrl {
        url: String,
        archive_info: ArchiveInfo,
        #[serde(skip_serializing_if = "Option::is_none")]
        subdirectory: Option<Box<Path>>,
    },
    /// The direct URL is path to a VCS repository.
    VcsUrl {
        url: String,
        vcs_info: VcsInfo,
        #[serde(skip_serializing_if = "Option::is_none")]
        subdirectory: Option<Box<Path>>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DirInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub editable: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ArchiveInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hashes: Option<BTreeMap<String, String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct VcsInfo {
    pub vcs: VcsKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_revision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_lfs: Option<bool>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VcsKind {
    Git,
    Hg,
    Bzr,
    Svn,
}

impl std::fmt::Display for VcsKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Git => write!(f, "git"),
            Self::Hg => write!(f, "hg"),
            Self::Bzr => write!(f, "bzr"),
            Self::Svn => write!(f, "svn"),
        }
    }
}
