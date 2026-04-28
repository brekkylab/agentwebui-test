use std::{fs, io::Write as _, path::Path, process::Command};

use anyhow::{Context as _, Result, bail};

const PYTHON_VERSION: &str = "3.12";
const DOCLING_PACKAGE: &str = "docling>=2,<3";

const DOCLING_SOURCE: &str = r#"
import json
import logging
import os
from pathlib import Path

os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
logging.getLogger("docling").setLevel(logging.CRITICAL)


def build_converter():
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import (
        PdfPipelineOptions,
        TableStructureOptions,
    )
    from docling.document_converter import DocumentConverter, PdfFormatOption

    pipeline_options = PdfPipelineOptions(
        do_ocr=False,
        do_table_structure=True,
        table_structure_options=TableStructureOptions(
            do_cell_matching=True,
            mode="accurate",
        ),
        accelerator_options={"num_threads": 4, "device": "auto"},
        do_picture_classification=False,
        do_picture_description=False,
        do_chart_extraction=False,
        do_code_enrichment=False,
        do_formula_enrichment=False,
        generate_page_images=False,
        generate_picture_images=False,
    )
    return DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
        }
    )


def main():
    args_path = os.environ.get("AILOY_ARGS_JSON_PATH", "")
    args = json.loads(Path(args_path).read_text(encoding="utf-8"))
    pdf_path = Path(args["pdf_path"])
    md_path = Path(args["md_path"])
    markdown = build_converter().convert(pdf_path).document.export_to_markdown()
    md_path.write_text(markdown, encoding="utf-8")


if __name__ == "__main__":
    main()
"#;

/// Converts an origin file to a markdown file at `corpus_path`, dispatching by extension.
pub fn translate(origin_path: &Path, corpus_path: &Path) -> Result<()> {
    let ext = origin_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    match ext {
        "pdf" => translate_pdf(origin_path, corpus_path),
        "html" | "htm" => translate_html(origin_path, corpus_path),
        _ => bail!("unsupported file type: .{ext}"),
    }
}

fn translate_pdf(pdf_path: &Path, md_path: &Path) -> Result<()> {
    let venv = docling_venv_path()?;
    ensure_venv(&venv)?;

    let args = serde_json::json!({
        "pdf_path": pdf_path,
        "md_path": md_path,
    });
    let mut args_file =
        tempfile::NamedTempFile::new().context("failed to create temp args file")?;
    args_file
        .write_all(args.to_string().as_bytes())
        .context("failed to write args")?;

    let mut script_file = tempfile::Builder::new()
        .suffix(".py")
        .tempfile()
        .context("failed to create temp script file")?;
    script_file
        .write_all(DOCLING_SOURCE.as_bytes())
        .context("failed to write python script")?;

    let python = venv.join("bin").join("python");
    let output = Command::new(&python)
        .arg(script_file.path())
        .env("AILOY_ARGS_JSON_PATH", args_file.path())
        .output()
        .context("failed to spawn python")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("docling conversion failed: {stderr}");
    }

    Ok(())
}

/// Convert a local HTML file to Markdown with YAML frontmatter.
///
/// Pipeline:
/// 1. Read HTML from `html_path`.
/// 2. Extract metadata + baseline body via `dom_smoothie` (Readability-style).
/// 3. If the page is a MediaWiki/Wikipedia article (`mw-parser-output`),
///    override the body with a direct `dom_query` extraction that strips
///    known noise selectors — recovers sibling sections that Readability
///    scoring tends to prune.
/// 4. Convert the chosen body HTML to Markdown via `html-to-markdown-rs`.
/// 5. Emit YAML frontmatter (title, byline, excerpt, language, dates, …)
///    followed by an optional `# Title` and the Markdown body.
fn translate_html(html_path: &Path, md_path: &Path) -> Result<()> {
    // 1. Acquire HTML.
    let html = fs::read_to_string(html_path)
        .with_context(|| format!("failed to read HTML file: {html_path:?}"))?;

    // 2. dom_smoothie — metadata + baseline body.
    let cfg = dom_smoothie::Config {
        candidate_select_mode: dom_smoothie::CandidateSelectMode::DomSmoothie,
        readable_min_score: 10.0,
        readable_min_content_length: 70,
        n_top_candidates: 10,
        ..Default::default()
    };
    let mut reader = dom_smoothie::Readability::new(html.as_str(), None, Some(cfg))
        .map_err(|e| anyhow::anyhow!("dom_smoothie::new: {e}"))?;
    let article = reader
        .parse()
        .map_err(|e| anyhow::anyhow!("dom_smoothie::parse: {e}"))?;

    // 3. Site-specific override.
    let (body_html, strategy) = if html.contains("mw-parser-output") {
        match extract_wikipedia_content(&html) {
            Some(wiki) => (wiki, "wikipedia_dom_query"),
            None => (article.content.to_string(), "dom_smoothie"),
        }
    } else if html.contains("theme-doc-markdown") {
        match extract_docusaurus_content(&html) {
            Some(d) => (d, "docusaurus_dom_query"),
            None => (article.content.to_string(), "dom_smoothie"),
        }
    } else if html.contains("data-questionid") {
        match extract_stackoverflow_content(&html) {
            Some(s) => (s, "stackoverflow_dom_query"),
            None => (article.content.to_string(), "dom_smoothie"),
        }
    } else {
        (article.content.to_string(), "dom_smoothie")
    };

    // 4. HTML → Markdown.
    let result = html_to_markdown_rs::convert(&body_html, Default::default())
        .map_err(|e| anyhow::anyhow!("html-to-markdown-rs: {e}"))?;
    let md_body = result
        .content
        .context("html-to-markdown-rs returned no content")?;

    // 5. YAML frontmatter.
    let mut out = String::from("---\n");
    out.push_str("converter: html-to-markdown-rs\n");
    out.push_str(&format!("extraction_strategy: {strategy}\n"));
    add_field(&mut out, "title", &article.title);
    if let Some(s) = article.byline.as_deref() {
        add_field(&mut out, "byline", s);
    }
    if let Some(s) = article.excerpt.as_deref() {
        add_field(&mut out, "excerpt", s);
    }
    if let Some(s) = article.site_name.as_deref() {
        add_field(&mut out, "site_name", s);
    }
    if let Some(s) = article.image.as_deref() {
        add_field(&mut out, "image", s);
    }
    if let Some(s) = article.favicon.as_deref() {
        add_field(&mut out, "favicon", s);
    }
    if let Some(s) = article.lang.as_deref() {
        add_field(&mut out, "language", s);
    }
    if let Some(s) = article.published_time.as_deref() {
        add_field(&mut out, "published_time", s);
    }
    if let Some(s) = article.modified_time.as_deref() {
        add_field(&mut out, "modified_time", s);
    }
    if let Some(s) = article.dir.as_deref() {
        add_field(&mut out, "dir", s);
    }
    if article.length > 0 {
        out.push_str(&format!("text_length: {}\n", article.length));
    }
    out.push_str("---\n\n");

    // 6. Optional H1 prepend.
    if !article.title.is_empty() && !body_starts_with_h1(&md_body) {
        out.push_str("# ");
        out.push_str(&article.title);
        out.push_str("\n\n");
    }
    out.push_str(&md_body);

    // 7. Write.
    fs::write(md_path, out).with_context(|| format!("failed to write corpus: {md_path:?}"))?;
    Ok(())
}

/// Extract `<div class="mw-parser-output">` inner HTML from a Wikipedia /
/// MediaWiki page after stripping known non-content selectors. Returns `None`
/// if the wrapper isn't present or the result would be empty.
fn extract_wikipedia_content(html: &str) -> Option<String> {
    let doc = dom_query::Document::from(html);

    for sel in &[
        "script",
        "style",
        "noscript",
        ".mw-editsection",
        ".printfooter",
        ".catlinks",
        ".navbox",
        ".navbox-inner",
        ".sistersitebox",
        ".metadata",
        ".reference",
        ".reflist",
        ".references",
        ".hatnote",
        ".mbox-text-span",
        ".mw-jump-link",
        ".mw-indicators",
        ".mw-empty-elt",
    ] {
        doc.select(sel).remove();
    }

    let content = doc.select("div.mw-parser-output");
    if !content.exists() {
        return None;
    }
    let html_out = content.inner_html().to_string();
    if html_out.trim().is_empty() {
        return None;
    }
    Some(html_out)
}

/// Extract `#mainbar` inner HTML from a Stack Exchange Q&A page after
/// stripping vote arrows, post menus, comment threads, and user cards.
/// `#mainbar` cleanly contains the question + all answers and excludes
/// the side rails. Returns `None` if the container isn't present.
fn extract_stackoverflow_content(html: &str) -> Option<String> {
    let doc = dom_query::Document::from(html);

    for sel in &[
        "script",
        "style",
        "noscript",
        ".js-vote-count",
        ".js-voting-container",
        ".js-vote-up-btn",
        ".js-vote-down-btn",
        ".post-menu",
        ".post-signature",
        ".user-action-time",
        ".comments",
        ".comments-link",
        ".js-comments-container",
        ".user-info",
        ".user-card",
        ".bookmark-btn",
        ".follow-post",
        "[role=region]",
    ] {
        doc.select(sel).remove();
    }

    let content = doc.select("#mainbar");
    if !content.exists() {
        return None;
    }
    let html_out = content.inner_html().to_string();
    if html_out.trim().is_empty() {
        return None;
    }
    Some(html_out)
}

/// Extract `.theme-doc-markdown` inner HTML from a Docusaurus-built site
/// (reactnative.dev, docusaurus.io, many JS framework docs). Strips embedded
/// TOC / pagination / breadcrumb noise. Returns `None` when the marker
/// isn't present.
fn extract_docusaurus_content(html: &str) -> Option<String> {
    let doc = dom_query::Document::from(html);

    for sel in &[
        "script",
        "style",
        "noscript",
        ".theme-doc-toc-mobile",
        ".theme-doc-toc-desktop",
        ".pagination-nav",
        ".theme-doc-breadcrumbs",
        ".theme-edit-this-page",
        ".theme-last-updated",
        ".theme-doc-version-banner",
    ] {
        doc.select(sel).remove();
    }

    let content = doc.select(".theme-doc-markdown");
    if !content.exists() {
        return None;
    }
    let html_out = content.inner_html().to_string();
    if html_out.trim().is_empty() {
        return None;
    }
    Some(html_out)
}

fn body_starts_with_h1(body: &str) -> bool {
    body.lines()
        .find(|l| !l.trim().is_empty())
        .map(|l| l.trim_start().starts_with("# "))
        .unwrap_or(false)
}

fn yaml_str(s: &str) -> String {
    let one_line = s.replace(['\n', '\r'], " ");
    let escaped = one_line.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

fn add_field(out: &mut String, key: &str, value: &str) {
    if !value.is_empty() {
        out.push_str(&format!("{key}: {}\n", yaml_str(value)));
    }
}

fn docling_venv_path() -> Result<std::path::PathBuf> {
    Ok(dirs::cache_dir()
        .context("cannot determine cache directory")?
        .join("ailoy")
        .join("venvs")
        .join("docling"))
}

fn ensure_venv(venv: &Path) -> Result<()> {
    if venv.join("bin").join("python").exists() {
        return Ok(());
    }

    let status = Command::new("uv")
        .args(["venv", "--python", PYTHON_VERSION])
        .arg(venv)
        .status()
        .context("failed to run `uv venv` — is uv installed?")?;
    if !status.success() {
        bail!("uv venv creation failed");
    }

    let status = Command::new("uv")
        .args(["pip", "install", "--python"])
        .arg(venv.join("bin").join("python"))
        .arg(DOCLING_PACKAGE)
        .status()
        .context("failed to run `uv pip install`")?;
    if !status.success() {
        bail!("uv pip install docling failed");
    }

    Ok(())
}
