use std::{fs, path::Path};

use anyhow::{Context as _, Result};

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
pub(super) fn translate_html(html_path: &Path, md_path: &Path) -> Result<()> {
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
