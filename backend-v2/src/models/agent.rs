use ailoy::agent::AgentSpec;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// --- Domain Models ---

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Agent {
    pub id: Uuid,
    pub spec: AgentSpec,
}

// --- Response DTOs ---

#[derive(Clone, Debug, Serialize, JsonSchema)]
pub struct AgentResponse {
    pub id: Uuid,
    pub spec: AgentSpec,
}

// --- Request DTOs ---

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateAgentRequest {
    pub spec: AgentSpec,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateAgentRequest {
    pub spec: AgentSpec,
}
