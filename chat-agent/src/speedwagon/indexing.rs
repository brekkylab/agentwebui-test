//! Speedwagon index building — wraps `knowledge_agent::build_index_multi`.
//!
//! Backend should call this module instead of depending on `knowledge-agent` directly.
//! This keeps `knowledge-agent` as an implementation detail of the speedwagon system.

use std::path::Path;

/// Build a tantivy search index from corpus directories.
///
/// - `index_dir`: output directory for the built index
/// - `corpus_dirs`: directories containing source files to index
/// - `verbose`: if true, print progress to stderr
pub fn build_index(
    index_dir: &Path,
    corpus_dirs: &[impl AsRef<Path>],
    verbose: bool,
) -> Result<(), anyhow::Error> {
    let dirs: Vec<std::path::PathBuf> = corpus_dirs.iter().map(|d| d.as_ref().to_path_buf()).collect();
    let settings = knowledge_agent::IndexSettings {
        schema_version: 1,
        no_merge: false,
    };
    knowledge_agent::build_index_multi(index_dir, &dirs, &settings, verbose)?;
    Ok(())
}
