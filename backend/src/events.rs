use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsEvent {
    SessionTitleUpdated {
        session_id: String,
        project_id: String,
        title: String,
    },
}
