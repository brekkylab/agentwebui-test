use ailoy::AgentProvider;
use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// --- Domain Models ---

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProviderProfile {
    pub id: Uuid,
    pub name: String,
    pub provider: AgentProvider,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// --- Response DTOs ---

#[derive(Clone, Debug, Serialize, JsonSchema)]
pub struct ProviderProfileResponse {
    pub id: Uuid,
    pub name: String,
    pub provider: AgentProvider,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// --- Request DTOs ---

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateProviderProfileRequest {
    pub name: String,
    pub provider: AgentProvider,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateProviderProfileRequest {
    pub name: String,
    pub provider: AgentProvider,
    #[serde(default)]
    pub is_default: bool,
}
