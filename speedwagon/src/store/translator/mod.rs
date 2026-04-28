use std::path::Path;

use anyhow::{Result, bail};

mod html;
mod pdf;

/// Converts an origin file to a markdown file at `corpus_path`, dispatching by extension.
pub fn translate(origin_path: &Path, corpus_path: &Path) -> Result<()> {
    let ext = origin_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    match ext {
        "pdf" => pdf::translate_pdf(origin_path, corpus_path),
        "html" | "htm" => html::translate_html(origin_path, corpus_path),
        _ => bail!("unsupported file type: .{ext}"),
    }
}
