use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum SourceType {
    LocalFile,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Source {
    pub id: Uuid,
    pub name: String,
    pub source_type: SourceType,
    pub file_path: Option<String>,
    pub size: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct SourceResponse {
    pub id: Uuid,
    pub name: String,
    pub source_type: SourceType,
    pub size: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<&Source> for SourceResponse {
    fn from(s: &Source) -> Self {
        Self {
            id: s.id,
            name: s.name.clone(),
            source_type: s.source_type.clone(),
            size: s.size,
            created_at: s.created_at,
            updated_at: s.updated_at,
        }
    }
}
