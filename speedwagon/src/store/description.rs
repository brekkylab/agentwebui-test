//! KB-level description generation from per-document `(title, purpose)` tuples.
//!
//! Pairs with `parser::PurposeAgent`: where `PurposeAgent` produces one
//! line of search-tuned metadata per document, `DescriptionAgent` produces
//! one line of routing-tuned metadata per knowledge base.
//!
//! This module is a library — it does not own any database, HTTP surface,
//! or "Manual vs Auto" policy. Callers (backend, CLI) decide when to call
//! `Store::describe`, what to do with the result, and how to persist it.
//!
//! Output shape chosen by offline experiments on financebench / cuad /
//! kpaperqa / bioasq:
//!
//! - The description is self-contained: it states what is *inside* the
//!   KB (document types, entities covered, topics it can answer) without
//!   referencing any other KB. The routing agent that reads several KB
//!   descriptions side-by-side does the comparison from a higher level;
//!   we don't bake that comparison into each description, so an
//!   adjacent KB being renamed or removed cannot stale a description.
//! - Target output ~200 chars: shortest length that still preserved a
//!   coherent identity sentence in the experiments.
//! - Input is each doc's `purpose` only — adding `title` did not improve
//!   routing on the probe set and increased input tokens by ~25%.
//! - On LLM failure, `fallback_description` returns
//!   `"{N} documents including: {top-5 titles}"`. Empty string would have
//!   silently degraded routing (an empty description anchored a wrong KB
//!   in the experiments).

use ailoy::{
    agent::{Agent, AgentProvider, AgentSpec},
    message::{Message, Part, Role},
};
use anyhow::{Context as _, Result};
use futures::StreamExt as _;

const MODEL: &str = "openai/gpt-5.4-mini";

const DESCRIPTION_INSTRUCTION: &str = concat!(
    "You write a description of a knowledge base for a routing agent. ",
    "The routing agent reads this description alongside descriptions of other ",
    "knowledge bases and picks the right one for a user's question. ",
    "Inputs: KB name, optional instruction, and a list of one-line document purposes. ",
    "Describe what is INSIDE this knowledge base — its document types, ",
    "the entities and time periods covered, and the topics it can answer. ",
    "Lead with the collective identity of the documents. ",
    "Do not compare this KB to others, list what it excludes, or mention ",
    "neighboring KB names. The routing agent does that comparison from a ",
    "higher level; your job is to describe this KB on its own terms. ",
    "Output must NOT mention dataset names, QA pairs, paper IDs, contract IDs, ",
    "or any metadata about how this knowledge base was assembled. ",
    "Describe ONLY what documents are inside, as if a curator wrote it. ",
    "Length: ~200 characters. Output a JSON object: {\"description\": \"<text>\"}."
);

/// Wraps an Ailoy agent that turns a `(title, purpose)` document list into
/// a single KB-level description string.
pub struct DescriptionAgent {
    spec: AgentSpec,
    provider: Option<AgentProvider>,
}

impl DescriptionAgent {
    pub fn new(provider: Option<AgentProvider>) -> Self {
        Self {
            spec: AgentSpec::new(MODEL).instruction(DESCRIPTION_INSTRUCTION),
            provider,
        }
    }

    /// Generate a KB-level description.
    ///
    /// `docs` is the full `(title, purpose)` list for the KB. Only `purpose`
    /// is rendered into the user message; `title` is kept in the signature
    /// so callers can feed the same slice to `fallback_description` when
    /// the LLM call returns empty.
    pub async fn generate(
        &self,
        kb_name: &str,
        instruction: Option<&str>,
        docs: &[(String, String)],
    ) -> Result<String> {
        let user = build_user_message(kb_name, instruction, docs);
        let query = Message::new(Role::User).with_contents([Part::text(user)]);

        let mut agent = match &self.provider {
            Some(provider) => Agent::try_with_provider(self.spec.clone(), provider).await?,
            None => Agent::try_new(self.spec.clone()).await?,
        };

        let mut text_parts: Vec<String> = Vec::new();
        {
            let mut stream = agent.run(query);
            while let Some(result) = stream.next().await {
                let output = result?;
                for part in &output.message.contents {
                    if let Some(text) = part.as_text() {
                        text_parts.push(text.to_string());
                    }
                }
            }
        }
        let raw = text_parts.join("");
        Ok(parse_description_response(&raw))
    }
}

fn build_user_message(
    kb_name: &str,
    instruction: Option<&str>,
    docs: &[(String, String)],
) -> String {
    let mut s = String::new();
    s.push_str(&format!("KB name: {kb_name}\n"));
    if let Some(instr) = instruction {
        if !instr.trim().is_empty() {
            s.push_str(&format!("KB instruction: {instr}\n"));
        }
    }
    s.push_str(&format!("\nDocuments ({}):\n", docs.len()));
    for (_title, purpose) in docs {
        let p = if purpose.is_empty() { "(no purpose)" } else { purpose.as_str() };
        s.push_str(&format!("- {p}\n"));
    }
    s
}

/// Mirrors `parser::parse_purpose_response`: try direct JSON, retry after
/// stripping any text around the JSON object, fall back to empty string.
/// An empty return signals the caller to use `fallback_description`.
fn parse_description_response(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(d) = value.get("description").and_then(|v| v.as_str()) {
            return d.trim().to_string();
        }
    }

    if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        if start < end {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&trimmed[start..=end]) {
                if let Some(d) = value.get("description").and_then(|v| v.as_str()) {
                    return d.trim().to_string();
                }
            }
        }
    }

    String::new()
}

/// Module-level entry point that mirrors `parser::get_title` /
/// `parser::get_purpose`: read `OPENAI_API_KEY` from the environment,
/// build the provider, run `DescriptionAgent`, and substitute
/// `fallback_description` if the LLM call returns an empty body. Pure
/// transport errors (missing key, network) propagate so the caller can
/// surface them.
pub async fn get_description(
    kb_name: &str,
    instruction: Option<&str>,
    docs: &[(String, String)],
) -> Result<String> {
    dotenvy::dotenv().ok();

    let mut provider = AgentProvider::new();
    provider.model_openai(
        std::env::var("OPENAI_API_KEY").context("OPENAI_API_KEY not set in environment")?,
    );

    let agent = DescriptionAgent::new(Some(provider));
    let result = agent.generate(kb_name, instruction, docs).await?;
    if result.is_empty() {
        log::warn!("description generation returned empty string; using fallback");
        let titles: Vec<String> = docs.iter().map(|(t, _)| t.clone()).collect();
        Ok(fallback_description(docs.len(), &titles))
    } else {
        Ok(result)
    }
}

/// Deterministic fallback used when the LLM call fails or returns empty.
///
/// The string is short enough to fit a system prompt's KB list and still
/// names the entities a routing agent needs. Doc count of zero produces an
/// empty string — there is nothing to describe.
pub fn fallback_description(doc_count: usize, top_titles: &[String]) -> String {
    if doc_count == 0 {
        return String::new();
    }
    let titles: Vec<&str> = top_titles
        .iter()
        .filter(|t| !t.is_empty())
        .take(5)
        .map(String::as_str)
        .collect();
    if titles.is_empty() {
        format!("{doc_count} documents")
    } else {
        format!("{doc_count} documents including: {}", titles.join("; "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_direct_json() {
        let raw = r#"{"description": "hello"}"#;
        assert_eq!(parse_description_response(raw), "hello");
    }

    #[test]
    fn parse_json_with_surrounding_text() {
        let raw = r#"Here you go: {"description": "hello"} done."#;
        assert_eq!(parse_description_response(raw), "hello");
    }

    #[test]
    fn parse_trims_inner_whitespace() {
        let raw = r#"{"description": "   hello   "}"#;
        assert_eq!(parse_description_response(raw), "hello");
    }

    #[test]
    fn parse_empty_input() {
        assert_eq!(parse_description_response(""), "");
        assert_eq!(parse_description_response("   "), "");
    }

    #[test]
    fn parse_missing_field() {
        let raw = r#"{"other": "value"}"#;
        assert_eq!(parse_description_response(raw), "");
    }

    #[test]
    fn parse_malformed_json() {
        assert_eq!(parse_description_response("{not json"), "");
    }

    #[test]
    fn fallback_zero_docs() {
        assert_eq!(fallback_description(0, &[]), "");
    }

    #[test]
    fn fallback_no_titles_falls_back_to_count_only() {
        assert_eq!(fallback_description(7, &[]), "7 documents");
        assert_eq!(
            fallback_description(7, &["".to_string(), "".to_string()]),
            "7 documents"
        );
    }

    #[test]
    fn fallback_with_titles_takes_top_five() {
        let titles = vec![
            "A".to_string(),
            "B".to_string(),
            "C".to_string(),
            "D".to_string(),
            "E".to_string(),
            "F".to_string(),
            "G".to_string(),
        ];
        assert_eq!(
            fallback_description(7, &titles),
            "7 documents including: A; B; C; D; E"
        );
    }

    #[test]
    fn user_message_skips_blank_instruction() {
        let docs = vec![
            ("T1".to_string(), "P1".to_string()),
            ("T2".to_string(), "".to_string()),
        ];
        let msg = build_user_message("kb1", Some("   "), &docs);
        assert!(msg.contains("KB name: kb1"));
        assert!(!msg.contains("KB instruction"));
        assert!(msg.contains("- P1"));
        assert!(msg.contains("- (no purpose)"));
    }

    #[test]
    fn user_message_renders_purpose_only_not_title() {
        let docs = vec![("Apple 10-K".to_string(), "Apple FY2021 annual report".to_string())];
        let msg = build_user_message("finance", None, &docs);
        // purpose is in, title is not
        assert!(msg.contains("Apple FY2021 annual report"));
        assert!(!msg.contains("Apple 10-K"));
    }

    // ---- Store integration ----

    #[tokio::test]
    async fn describe_returns_empty_for_empty_store() {
        // Empty store → describe short-circuits before any LLM call,
        // so this runs without OPENAI_API_KEY.
        let tmp = tempfile::tempdir().expect("tempdir");
        let store = crate::store::Store::new(tmp.path()).expect("open store");
        let result = store
            .describe("kb-empty", None)
            .await
            .expect("describe should not fail on empty store");
        assert_eq!(result, "");
    }

    #[tokio::test]
    #[ignore = "requires OPENAI_API_KEY"]
    async fn describe_round_trips_against_pre_populated_index() {
        // Pre-populate the index with deterministic (title, purpose) pairs
        // so this test only exercises the description path, not PurposeAgent
        // / TitleAgent. Mirrors the indexer round-trip tests in spirit.
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path();
        let index_dir = root.join("index");
        let index = crate::store::indexer::open_or_create(&index_dir).expect("open index");
        crate::store::indexer::add_document(
            &index,
            "doc1",
            "Apple FY2021 10-K",
            "Apple Inc. 2021 Form 10-K annual report — revenue, iPhone, services, SEC filing",
            "body 1",
        )
        .expect("add doc1");
        crate::store::indexer::add_document(
            &index,
            "doc2",
            "Walmart FY2023 10-K",
            "Walmart Inc. FY2023 Form 10-K annual report — omnichannel, retail, SEC filing",
            "body 2",
        )
        .expect("add doc2");
        // drop the writer-backed Index so Store::new can reopen the same dir.
        drop(index);

        // We need origin/ and corpus/ to exist for Store::new.
        std::fs::create_dir_all(root.join("origin")).unwrap();
        std::fs::create_dir_all(root.join("corpus")).unwrap();

        let store = crate::store::Store::new(root).expect("open store");
        let description = store
            .describe("finance", Some("public-company financial filings"))
            .await
            .expect("describe");

        assert!(!description.is_empty(), "description should not be empty");
        assert!(
            description.chars().count() < 600,
            "description should stay short: {description:?}"
        );
        // The model should pick up at least one of the entity tokens we fed in.
        let lowered = description.to_lowercase();
        let mentions_finance_token = ["apple", "walmart", "10-k", "filing", "financial"]
            .iter()
            .any(|t| lowered.contains(t));
        assert!(
            mentions_finance_token,
            "description did not mention any expected token: {description:?}"
        );
    }
}
