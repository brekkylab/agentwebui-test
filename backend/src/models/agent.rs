use ailoy::AgentSpec as RuntimeAgentSpec;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::agent::spec::AgentSpec;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Agent {
    pub id: Uuid,
    pub spec: RuntimeAgentSpec,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct AgentResponse {
    pub id: Uuid,
    pub spec: AgentSpec,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateAgentRequest {
    pub spec: AgentSpec,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateAgentRequest {
    pub spec: AgentSpec,
}
