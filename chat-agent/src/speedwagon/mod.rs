//! Speedwagon sub-agent integration.
//!
//! Registers one in-memory `AgentRuntime` per KB entry as a `SubagentTool` on
//! the parent ChatAgent's `ToolSet`.  Each subagent is built upfront at
//! `ChatAgent` construction time and persists for the lifetime of the agent.

pub mod dispatch;
pub mod indexing;

use serde::Deserialize;

pub use dispatch::register_speedwagon_subagents;

#[derive(Debug, Clone, Deserialize)]
pub struct KbEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub index_dir: String,
    pub corpus_dirs: Vec<String>,
    #[serde(default)]
    pub instruction: Option<String>,
    #[serde(default)]
    pub lm: Option<String>,
    /// File names in the corpus directory, exposed to the LLM so it can judge
    /// whether a question relates to this knowledge base.
    #[serde(default)]
    pub document_names: Vec<String>,
}

/// Provider config extracted from the parent ChatAgent's provider,
/// passed down to speedwagon sub-agents so they use the same API credentials.
#[derive(Clone)]
pub struct SubAgentProvider {
    pub api_key: String,
    pub api_url: String,
    /// The parent agent's model name, used as fallback when KbEntry.lm is None.
    pub model_name: String,
}

impl SubAgentProvider {
    /// Extract API credentials from the parent agent's provider.
    pub fn from_provider(provider: &ailoy::AgentProvider, model_name: &str) -> Self {
        match &provider.lm {
            ailoy::LangModelProvider::API { url, api_key, .. } => Self {
                api_key: api_key.clone().unwrap_or_default(),
                api_url: url.to_string(),
                model_name: model_name.to_string(),
            },
        }
    }
}

