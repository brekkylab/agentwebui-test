use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct Session {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// --- Response DTOs ---

/// API response for GET /sessions (list) and POST /sessions (create) -- no messages
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct SessionResponse {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<&Session> for SessionResponse {
    fn from(s: &Session) -> Self {
        Self {
            id: s.id,
            agent_id: s.agent_id,
            created_at: s.created_at,
            updated_at: s.updated_at,
        }
    }
}

/// API response for GET /sessions/{id} -- includes messages with tool calls
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct SessionDetailResponse {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// --- Request DTOs ---

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ListSessionsQuery {
    pub agent_id: Option<Uuid>,
    pub include_messages: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateSessionRequest {
    pub agent_id: Uuid,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct UpdateSessionRequest {
    pub title: Option<String>,
    pub provider_profile_id: Option<Uuid>,
    pub speedwagon_ids: Option<Vec<Uuid>>,
    pub source_ids: Option<Vec<Uuid>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct AddSessionMessageRequest {
    pub content: String,
}
