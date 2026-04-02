use ailoy::AgentProvider as RuntimeAgentProvider;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::agent::spec::AgentProvider;

// --- Domain Models ---

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProviderProfile {
    pub id: Uuid,
    pub name: String,
    pub provider: RuntimeAgentProvider,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// --- Response DTOs ---

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct ProviderProfileResponse {
    pub id: Uuid,
    pub name: String,
    pub provider: AgentProvider,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// --- Request DTOs ---

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateProviderProfileRequest {
    pub name: String,
    pub provider: AgentProvider,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateProviderProfileRequest {
    pub name: String,
    pub provider: AgentProvider,
    #[serde(default)]
    pub is_default: bool,
}
