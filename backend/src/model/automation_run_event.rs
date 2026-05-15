use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::repository::DbAutomationRunEvent;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    Triggered,
    Queued,
    Started,
    Succeeded,
    Failed,
    Cancelled,
    Timeout,
    RetryScheduled,
    LeaseLost,
    StepStarted,
    StepFinished,
    TurnStarted,
    TurnFinished,
    ToolInvoked,
}

impl EventKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            EventKind::Triggered => "triggered",
            EventKind::Queued => "queued",
            EventKind::Started => "started",
            EventKind::Succeeded => "succeeded",
            EventKind::Failed => "failed",
            EventKind::Cancelled => "cancelled",
            EventKind::Timeout => "timeout",
            EventKind::RetryScheduled => "retry_scheduled",
            EventKind::LeaseLost => "lease_lost",
            EventKind::StepStarted => "step_started",
            EventKind::StepFinished => "step_finished",
            EventKind::TurnStarted => "turn_started",
            EventKind::TurnFinished => "turn_finished",
            EventKind::ToolInvoked => "tool_invoked",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "triggered" => Some(EventKind::Triggered),
            "queued" => Some(EventKind::Queued),
            "started" => Some(EventKind::Started),
            "succeeded" => Some(EventKind::Succeeded),
            "failed" => Some(EventKind::Failed),
            "cancelled" => Some(EventKind::Cancelled),
            "timeout" => Some(EventKind::Timeout),
            "retry_scheduled" => Some(EventKind::RetryScheduled),
            "lease_lost" => Some(EventKind::LeaseLost),
            "step_started" => Some(EventKind::StepStarted),
            "step_finished" => Some(EventKind::StepFinished),
            "turn_started" => Some(EventKind::TurnStarted),
            "turn_finished" => Some(EventKind::TurnFinished),
            "tool_invoked" => Some(EventKind::ToolInvoked),
            _ => None,
        }
    }
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct EventResponse {
    pub id: i64,
    pub run_id: Uuid,
    pub ts: DateTime<Utc>,
    pub kind: EventKind,
    pub attempt: i64,
    /// Shape depends on `kind`. See typed helpers below.
    pub payload: Option<serde_json::Value>,
}

impl From<DbAutomationRunEvent> for EventResponse {
    fn from(e: DbAutomationRunEvent) -> Self {
        Self {
            id: e.id,
            run_id: e.run_id,
            ts: e.ts,
            kind: e.kind,
            attempt: e.attempt,
            payload: e.payload,
        }
    }
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct EventListResponse {
    pub items: Vec<EventResponse>,
}

// --- typed payload helpers ---------------------------------------------------
// These are convenience structs for writers/readers. They are serialised to
// `serde_json::Value` before storage so the schema stays flexible per `kind`.

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TriggeredPayload {
    pub source: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub headers: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw_truncated: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FailedPayload {
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct StepStartedPayload {
    pub step_index: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct StepFinishedPayload {
    pub step_index: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RetryScheduledPayload {
    pub next_run_id: Uuid,
    pub scheduled_for: DateTime<Utc>,
    pub attempt: i64,
}
