use std::sync::Arc;

use ailoy::agent::AgentProvider;
use ailoy::lang_model::{LangModelAPISchema, LangModelProvider};
use url::Url;
use uuid::Uuid;

use crate::repository::{
    Repository, RepositoryError, RepositoryResult, create_repository_from_env,
};

pub struct AppState {
    pub repository: Arc<dyn Repository>,
}

impl AppState {
    pub async fn new() -> std::io::Result<Self> {
        let repository = create_repository_from_env().await.map_err(to_io_error)?;
        let state = Self { repository };
        state
            .overwrite_default_provider_profiles_from_env()
            .await
            .map_err(to_io_error)?;
        Ok(state)
    }

    #[cfg(test)]
    pub async fn new_without_bootstrap(database_url: &str) -> RepositoryResult<Self> {
        use crate::repository::create_repository;
        let repository = create_repository(database_url).await?;
        Ok(Self { repository })
    }

    /// No-op: runtime cache removed; kept for call-site compatibility.
    pub fn invalidate_runtimes_by_agent_id(&self, _agent_id: Uuid) {}

    async fn overwrite_default_provider_profiles_from_env(&self) -> RepositoryResult<()> {
        let profile_definitions: &[(&str, &str, LangModelAPISchema, &str)] = &[
            (
                "OPENAI_API_KEY",
                "openai-default",
                LangModelAPISchema::OpenAI,
                "https://api.openai.com/v1/responses",
            ),
            (
                "ANTHROPIC_API_KEY",
                "anthropic-default",
                LangModelAPISchema::Anthropic,
                "https://api.anthropic.com/v1/messages",
            ),
            (
                "GEMINI_API_KEY",
                "gemini-default",
                LangModelAPISchema::Gemini,
                "https://generativelanguage.googleapis.com/v1beta/models/",
            ),
        ];

        for (env_key, name, schema, url) in profile_definitions {
            let Ok(api_key) = std::env::var(env_key) else {
                continue;
            };
            if api_key.trim().is_empty() {
                continue;
            }
            let provider = build_provider(schema.clone(), url, api_key);
            self.repository
                .upsert_provider_profile_by_name(name, provider, true)
                .await?;
        }

        Ok(())
    }
}

fn build_provider(schema: LangModelAPISchema, url: &str, api_key: String) -> AgentProvider {
    let url = Url::parse(url).expect("valid provider URL");
    let lm = LangModelProvider::API {
        schema,
        url,
        api_key: Some(api_key),
        max_tokens: None,
    };
    AgentProvider {
        models: std::collections::BTreeMap::from([("*".to_string(), lm)]),
        tools: vec![],
    }
}

fn to_io_error(error: RepositoryError) -> std::io::Error {
    std::io::Error::other(error.to_string())
}
