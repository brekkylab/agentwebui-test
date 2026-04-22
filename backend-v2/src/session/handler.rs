use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use uuid::Uuid;

use crate::{
    error::AppError,
    session::model::{
        CreateSessionRequest, ListSessionsQuery, SessionDetailResponse, SessionResponse,
        UpdateSessionRequest,
    },
    state::AppState,
};

async fn create_session(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<(StatusCode, Json<SessionResponse>), (StatusCode, Json<AppError>)> {
    todo!()
    // let session = session_service::create_session(&state, payload)
    //     .await
    //     .map_err(session_err)?;
    // Ok((StatusCode::CREATED, Json(SessionResponse::from(&session))))
}

async fn list_sessions(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListSessionsQuery>,
) -> Result<Json<Vec<SessionResponse>>, (StatusCode, Json<AppError>)> {
    todo!()
    // let ListSessionsQuery {
    //     agent_id,
    //     include_messages,
    // } = query;

    // let sessions = state
    //     .repository
    //     .list_sessions(agent_id, include_messages.unwrap_or(false))
    //     .await
    //     .map_err(repo_err)?;
    // Ok(Json(sessions.iter().map(SessionResponse::from).collect()))
}

async fn get_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<SessionDetailResponse>, (StatusCode, Json<AppError>)> {
    todo!()
    // match session_service::get_session_detail(&state, id)
    //     .await
    //     .map_err(session_err)?
    // {
    //     Some(detail) => Ok(Json(detail)),
    //     None => Err(AppError::not_found("session not found")),
    // }
}

async fn update_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateSessionRequest>,
) -> Result<Json<SessionResponse>, (StatusCode, Json<AppError>)> {
    todo!()
    // let session = session_service::update_session(&state, id, payload)
    //     .await
    //     .map_err(|e| AppError::internal(e.to_string()))?;
    // Ok(Json(SessionResponse::from(&session)))
}

async fn delete_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<AppError>)> {
    todo!()
    // session_service::delete_session(&state, id)
    //     .await
    //     .map_err(|e| AppError::internal(e.to_string()))?;
    // Ok(StatusCode::NO_CONTENT)
}
