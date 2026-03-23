use ailoy::{AgentProvider, AgentRuntime, AgentSpec, Message, Part, Role, ToolSet};

/// Lightweight owner of an `AgentRuntime` for chat use cases.
pub struct ChatAgent {
    runtime: AgentRuntime,
}

#[derive(Debug, thiserror::Error)]
pub enum ChatAgentRunError {
    #[error("failed to run language model")]
    Runtime {
        #[source]
        source: anyhow::Error,
    },
    #[error("model response did not include text content")]
    NoTextContent,
}

impl ChatAgent {
    pub fn new(spec: AgentSpec, provider: AgentProvider) -> Self {
        let runtime = AgentRuntime::new(spec, provider, ToolSet::new());
        Self { runtime }
    }

    pub async fn run_user_text(
        &mut self,
        content: impl Into<String>,
    ) -> Result<String, ChatAgentRunError> {
        let query = Message::new(Role::User).with_contents([Part::text(content.into())]);
        let message = self
            .runtime
            .run(query)
            .await
            .map_err(|source| ChatAgentRunError::Runtime { source })?;

        extract_assistant_text(&message).ok_or(ChatAgentRunError::NoTextContent)
    }
}

fn extract_assistant_text(message: &Message) -> Option<String> {
    let text = message
        .contents
        .iter()
        .filter_map(|part| part.as_text())
        .collect::<Vec<_>>()
        .join("");

    if text.is_empty() { None } else { Some(text) }
}

#[cfg(test)]
mod tests {
    use super::{ChatAgent, extract_assistant_text};
    use ailoy::{AgentProvider, AgentSpec, LangModelAPISchema, LangModelProvider, Message, Part, Role};

    fn sample_spec() -> AgentSpec {
        AgentSpec {
            lm: "gpt-4.1-mini".to_string(),
            instruction: None,
            tools: vec![],
        }
    }

    fn sample_provider() -> AgentProvider {
        AgentProvider {
            lm: LangModelProvider::API {
                schema: LangModelAPISchema::ChatCompletion,
                url: "https://example.com/v1/chat/completions"
                    .parse()
                    .expect("valid URL for test provider"),
                api_key: Some("test-key".to_string()),
            },
            tools: vec![],
        }
    }

    #[test]
    fn new_creates_chat_agent_with_runtime() {
        let _agent = ChatAgent::new(sample_spec(), sample_provider());
    }

    #[test]
    fn run_user_text_method_is_available() {
        let mut agent = ChatAgent::new(sample_spec(), sample_provider());
        let fut = agent.run_user_text("hello");
        drop(fut);
    }

    #[test]
    fn extract_assistant_text_joins_text_parts() {
        let message = Message::new(Role::Assistant).with_contents([Part::text("a"), Part::text("b")]);
        assert_eq!(extract_assistant_text(&message), Some("ab".to_string()));
    }

    #[test]
    fn extract_assistant_text_returns_none_when_no_text() {
        let message = Message::new(Role::Assistant);
        assert_eq!(extract_assistant_text(&message), None);
    }
}
