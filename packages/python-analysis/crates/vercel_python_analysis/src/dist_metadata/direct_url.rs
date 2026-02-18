//! direct_url.json parsing using uv's DirectUrl type.
//!
//! See: https://packaging.python.org/en/latest/specifications/direct-url-data-structure/

use uv_pypi_types::DirectUrl;

use crate::bindings::{ArchiveUrlInfo, DirUrlInfo, DirectUrlInfo, VcsUrlInfo};

/// Parse a direct_url.json file (PEP 610).
pub(crate) fn parse(content: &str) -> Result<DirectUrlInfo, String> {
    let direct_url: DirectUrl = serde_json::from_str(content).map_err(|e| e.to_string())?;

    match direct_url {
        DirectUrl::LocalDirectory { url, dir_info, .. } => {
            Ok(DirectUrlInfo::LocalDirectory(DirUrlInfo {
                url,
                editable: dir_info.editable.unwrap_or(false),
            }))
        }
        DirectUrl::ArchiveUrl {
            url, archive_info, ..
        } => Ok(DirectUrlInfo::Archive(ArchiveUrlInfo {
            url,
            hash: archive_info.hash,
        })),
        DirectUrl::VcsUrl {
            url, vcs_info, ..
        } => Ok(DirectUrlInfo::Vcs(VcsUrlInfo {
            url,
            vcs: vcs_info.vcs.to_string(),
            commit_id: vcs_info.commit_id,
            requested_revision: vcs_info.requested_revision,
        })),
    }
}
