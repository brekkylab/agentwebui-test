use ailoy::agent::{Agent, AgentCard, AgentProvider, AgentSpec};

const SYSTEM_PROMPT: &str = "You are a helpful assistant.";

#[derive(Debug, Clone)]
pub struct MainAgentSpec {
    spec: AgentSpec,
}

impl MainAgentSpec {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.spec.model = model.into();
        self
    }

    pub fn card(mut self, card: AgentCard) -> Self {
        self.spec.card = Some(card);
        self
    }

    pub fn into_spec(self) -> AgentSpec {
        self.into()
    }

    pub async fn into_runtime(self) -> anyhow::Result<Agent> {
        Agent::try_new(self.spec).await
    }

    pub async fn into_runtime_with_provider(
        self,
        provider: &AgentProvider,
    ) -> anyhow::Result<Agent> {
        Agent::try_with_provider(self.spec, provider).await
    }
}

impl Default for MainAgentSpec {
    fn default() -> Self {
        Self {
            spec: AgentSpec::new("openai/gpt-4.1-mini")
                .instruction(SYSTEM_PROMPT)
                .tools(["web_search"]),
        }
    }
}

impl From<MainAgentSpec> for AgentSpec {
    fn from(value: MainAgentSpec) -> Self {
        value.spec
    }
}
