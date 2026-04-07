//! Speedwagon dispatch — registering speedwagon sub-agents as in-memory tools.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use ailoy::{LangModelAPISchema, LangModelProvider, ToolSet};
use knowledge_agent::{AgentConfig, SearchIndex, ToolConfig, build_agent};
use tokio::sync::Mutex as TokioMutex;
use url::Url;

use super::{KbEntry, SubAgentProvider};

/// Grounding rules injected into every Speedwagon sub-agent system prompt.
/// Prevents the sub-agent from reframing document content through its own
/// parametric knowledge — document corpus is always the authoritative source.
const GROUNDING_RULES: &str = r#"<grounding_rules>
Your primary source of truth is the document corpus you are searching.
When you find relevant content, report it as the authoritative answer.

You MAY add expert analysis or synthesis that builds ON TOP of what
the documents say — this adds value.

You MUST NOT let your training knowledge reframe, contradict, or override
what the documents contain. If a document contains information about "X",
report that information as-is — even if "X" also refers to something
entirely different in the outside world.

The user is asking about THEIR documents. Answer from THEIR documents.

Example:
  Document "aurora.txt" contains a short story about a cat named Aurora.
  User question: "Tell me about aurora"

  BAD (reframing through your own knowledge):
    "This document is not about the aurora borealis.
     Instead it contains a story about a cat..."

  GOOD (document content as the anchor):
    "According to aurora.txt, Aurora is a cat living in an alley.
     The story describes her daily adventures..."
</grounding_rules>"#;

/// Register one in-memory speedwagon subagent per KB entry into `tool_set`.
///
/// Each subagent is an `AgentRuntime` built upfront from the KB entry's config,
/// wrapped in `Arc<TokioMutex<>>`, and registered via `ToolSet::with_subagent_in_memory`.
/// The tool name is the KB entry's `id`; description comes from `entry.description`.
///
/// Entries whose search index cannot be opened are skipped with a warning.
/// Returns the updated `ToolSet` (builder-style chaining).
pub fn register_speedwagon_subagents(
    mut tool_set: ToolSet,
    entries: &[KbEntry],
    provider: &SubAgentProvider,
) -> ToolSet {
    for entry in entries {
        let index_path = Path::new(&entry.index_dir);
        let search_index = match SearchIndex::open(index_path) {
            Ok(idx) => Arc::new(idx),
            Err(e) => {
                tracing::warn!(
                    "[speedwagon] skipping kb={}: failed to open index at {:?}: {e}",
                    entry.id,
                    index_path
                );
                continue;
            }
        };

        let target_dirs: Vec<PathBuf> = entry.corpus_dirs.iter().map(PathBuf::from).collect();

        let default_config = AgentConfig::default();
        let system_prompt = match &entry.instruction {
            Some(custom) if !custom.trim().is_empty() => format!(
                "{}\n\n{}\n\n<additional_instructions>\n{}\n</additional_instructions>",
                default_config.system_prompt,
                GROUNDING_RULES,
                custom.trim()
            ),
            _ => format!("{}\n\n{}", default_config.system_prompt, GROUNDING_RULES),
        };

        let agent_config = AgentConfig {
            provider: LangModelProvider::API {
                schema: LangModelAPISchema::ChatCompletion,
                url: Url::parse(&provider.api_url).expect("invalid api_url in SubAgentProvider"),
                api_key: Some(provider.api_key.clone()),
            },
            system_prompt,
            model_name: entry
                .lm
                .clone()
                .unwrap_or_else(|| provider.model_name.clone()),
        };

        let agent = build_agent(&agent_config, &ToolConfig::default(), &search_index, target_dirs);
        let agent = Arc::new(TokioMutex::new(agent));

        tool_set = tool_set.with_subagent_in_memory(
            format!("ask_speedwagon_{}", entry.id),
            entry.description.clone(),
            agent,
        );
    }

    tool_set
}
