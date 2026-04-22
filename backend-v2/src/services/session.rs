use ailoy::agent::AgentProvider;
use ailoy::lang_model::{LangModelAPISchema, LangModelProvider};
use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::models::{
    CreateSessionRequest, ErrorResponse, Session, SessionDetailResponse, UpdateSessionRequest,
};
// use crate::repository::RepositoryError;
use crate::state::AppState;

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("session not found")]
    NotFound,
    #[error("agent not found")]
    AgentNotFound,
    #[error("provider profile not found")]
    ProviderProfileNotFound,
    #[error("no default provider profile available")]
    NoDefaultProviderProfile,
    #[error(transparent)]
    Repository(#[from] RepositoryError),
}

impl IntoResponse for SessionError {
    fn into_response(self) -> Response {
        let status = match &self {
            Self::NotFound | Self::AgentNotFound | Self::ProviderProfileNotFound => {
                StatusCode::NOT_FOUND
            }
            Self::NoDefaultProviderProfile => StatusCode::BAD_REQUEST,
            Self::Repository(e) => {
                tracing::error!("repository error: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };
        let error_msg = if matches!(self, Self::Repository(_)) {
            "internal server error".to_string()
        } else {
            self.to_string()
        };
        (status, Json(ErrorResponse { error: error_msg })).into_response()
    }
}

pub async fn create_session(
    state: &AppState,
    req: CreateSessionRequest,
) -> Result<Session, SessionError> {
    let CreateSessionRequest { agent_id } = req;

    match state.repository.get_agent(agent_id).await? {
        Some(_) => {}
        None => return Err(SessionError::AgentNotFound),
    }

    let resolved_id = resolve_provider_profile_id(state, provider_profile_id).await?;

    let session = state
        .repository
        .create_session(agent_id, resolved_id)
        .await?;

    Ok(session)
}

pub async fn update_session(
    state: &AppState,
    id: Uuid,
    req: UpdateSessionRequest,
) -> Result<Session, SessionError> {
    if let Some(pp_id) = req.provider_profile_id {
        match state.repository.get_provider_profile(pp_id).await? {
            Some(_) => {}
            None => return Err(SessionError::ProviderProfileNotFound),
        }
    }

    let session = state
        .repository
        .update_session_atomic(id)
        .await?
        .ok_or(SessionError::NotFound)?;

    Ok(session)
}

pub async fn delete_session(state: &AppState, id: Uuid) -> Result<(), SessionError> {
    let deleted = state.repository.delete_session(id).await?;
    if !deleted {
        return Err(SessionError::NotFound);
    }
    Ok(())
}

// async fn resolve_provider_profile_id(
//     state: &AppState,
//     requested: Option<Uuid>,
// ) -> Result<Uuid, SessionError> {
//     if let Some(id) = requested {
//         return match state.repository.get_provider_profile(id).await? {
//             Some(_) => Ok(id),
//             None => Err(SessionError::ProviderProfileNotFound),
//         };
//     }

//     let profiles = state.repository.list_provider_profiles().await?;

//     profiles
//         .iter()
//         .filter(|p| p.is_default)
//         .min_by(|a, b| {
//             provider_priority(&a.provider)
//                 .cmp(&provider_priority(&b.provider))
//                 .then_with(|| a.created_at.cmp(&b.created_at))
//                 .then_with(|| a.id.cmp(&b.id))
//         })
//         .map(|p| p.id)
//         .ok_or(SessionError::NoDefaultProviderProfile)
// }

// fn provider_priority(provider: &AgentProvider) -> u8 {
//     let lm = provider
//         .models
//         .get("*")
//         .or_else(|| provider.models.values().next());
//     match lm {
//         Some(LangModelProvider::API { schema, .. }) => match schema {
//             LangModelAPISchema::ChatCompletion => 0,
//             LangModelAPISchema::Anthropic => 1,
//             LangModelAPISchema::Gemini => 2,
//             LangModelAPISchema::OpenAI => 3,
//         },
//         _ => u8::MAX,
//     }
// }
