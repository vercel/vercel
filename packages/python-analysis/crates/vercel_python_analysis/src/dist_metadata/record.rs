//! RECORD file parsing using the csv crate.
//!
//! RECORD files are headerless CSV with three columns: path, hash, size.
//! See: https://packaging.python.org/en/latest/specifications/recording-installed-packages/

use serde::Deserialize;

use crate::bindings::RecordEntry;

#[derive(Deserialize)]
struct RawRecordEntry {
    path: String,
    hash: Option<String>,
    size: Option<u64>,
}

/// Parse a RECORD file into a list of record entries.
pub(crate) fn parse(content: &str) -> Result<Vec<RecordEntry>, String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(content.as_bytes());

    let mut entries = Vec::new();
    for result in reader.deserialize::<RawRecordEntry>() {
        let raw = result.map_err(|e| e.to_string())?;
        // Normalize empty strings to None
        let hash = raw.hash.filter(|s| !s.is_empty());
        entries.push(RecordEntry {
            path: raw.path,
            hash,
            size: raw.size,
        });
    }
    Ok(entries)
}
