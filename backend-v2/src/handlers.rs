use std::sync::Arc;

use aide::axum::ApiRouter;
use aide::axum::routing::get;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use schemars::JsonSchema;
use serde::Serialize;
use uuid::Uuid;

use crate::models::{
    Agent, AgentResponse, CreateAgentRequest, CreateSessionRequest, ListSessionsQuery,
    SessionDetailResponse, SessionResponse, UpdateAgentRequest, UpdateSessionRequest,
};
// use crate::repository::RepositoryError;
// use crate::services::session::{self as session_service, SessionError};
use crate::state::AppState;

type AppState_ = Arc<AppState>;
type ApiErr = (StatusCode, Json<AppError>);
type ApiResult<T> = Result<T, ApiErr>;

#[derive(Debug, JsonSchema, Serialize)]
struct AppError {
    error: String,
}

impl AppError {
    fn not_found(msg: impl Into<String>) -> ApiErr {
        (StatusCode::NOT_FOUND, Json(Self { error: msg.into() }))
    }
    fn conflict(msg: impl Into<String>) -> ApiErr {
        (StatusCode::CONFLICT, Json(Self { error: msg.into() }))
    }
    #[allow(dead_code)]
    fn bad_request(msg: impl Into<String>) -> ApiErr {
        (StatusCode::BAD_REQUEST, Json(Self { error: msg.into() }))
    }
    fn internal(msg: impl Into<String>) -> ApiErr {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(Self { error: msg.into() }),
        )
    }
}

// fn repo_err(error: RepositoryError) -> ApiErr {
//     tracing::error!("repository error: {error}");
//     AppError::internal("internal server error")
// }

// fn session_err(e: SessionError) -> ApiErr {
//     let status = match &e {
//         SessionError::NotFound
//         | SessionError::AgentNotFound
//         | SessionError::ProviderProfileNotFound => StatusCode::NOT_FOUND,
//         SessionError::NoDefaultProviderProfile => StatusCode::BAD_REQUEST,
//         SessionError::Repository(_) => StatusCode::INTERNAL_SERVER_ERROR,
//     };
//     let msg = if matches!(e, SessionError::Repository(_)) {
//         "internal server error".to_string()
//     } else {
//         e.to_string()
//     };
//     (status, Json(AppError { error: msg }))
// }

pub fn router(state: AppState_) -> ApiRouter {
    ApiRouter::new()
        .api_route("/health", get(health))
        .api_route("/agents", get(list_agents).post(create_agent))
        .api_route(
            "/agents/{id}",
            get(get_agent).put(update_agent).delete(delete_agent),
        )
        .api_route("/sessions", get(list_sessions).post(create_session))
        .api_route(
            "/sessions/{id}",
            get(get_session).put(update_session).delete(delete_session),
        )
        .with_state(state)
}

#[derive(Serialize, JsonSchema)]
struct HealthResponse {
    status: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

async fn create_agent(
    State(state): State<AppState_>,
    Json(payload): Json<CreateAgentRequest>,
) -> Result<(StatusCode, Json<AgentResponse>), (StatusCode, Json<AppError>)> {
    let CreateAgentRequest { spec } = payload;
    todo!()
    // let agent = state
    //     .repository
    //     .create_agent(spec)
    //     .await
    //     .map_err(repo_err)?;
    // Ok((StatusCode::CREATED, Json(to_agent_response(&agent))))
}

async fn list_agents(
    State(state): State<AppState_>,
) -> Result<Json<Vec<AgentResponse>>, (StatusCode, Json<AppError>)> {
    todo!()
    // let agents = state.repository.list_agents().await.map_err(repo_err)?;
    // Ok(Json(agents.iter().map(to_agent_response).collect()))
}

async fn get_agent(
    State(state): State<AppState_>,
    Path(id): Path<Uuid>,
) -> Result<Json<AgentResponse>, (StatusCode, Json<AppError>)> {
    todo!()
    // match state.repository.get_agent(id).await.map_err(repo_err)? {
    //     Some(agent) => Ok(Json(to_agent_response(&agent))),
    //     None => Err(AppError::not_found("agent not found")),
    // }
}

async fn update_agent(
    State(state): State<AppState_>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateAgentRequest>,
) -> Result<Json<AgentResponse>, (StatusCode, Json<AppError>)> {
    todo!()
    // let UpdateAgentRequest { spec } = payload;
    // match state
    //     .repository
    //     .update_agent(id, spec)
    //     .await
    //     .map_err(repo_err)?
    // {
    //     Some(agent) => {
    //         state.invalidate_runtimes_by_agent_id(id);
    //         Ok(Json(to_agent_response(&agent)))
    //     }
    //     None => Err(AppError::not_found("agent not found")),
    // }
}

async fn delete_agent(
    State(state): State<AppState_>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<AppError>)> {
    todo!()
    // if state
    //     .repository
    //     .has_sessions_for_agent(id)
    //     .await
    //     .map_err(repo_err)?
    // {
    //     return Err(AppError::conflict(
    //         "cannot delete agent with existing sessions",
    //     ));
    // }
    // match state.repository.delete_agent(id).await.map_err(repo_err)? {
    //     true => Ok(StatusCode::NO_CONTENT),
    //     false => Err(AppError::not_found("agent not found")),
    // }
}

async fn create_session(
    State(state): State<AppState_>,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<(StatusCode, Json<SessionResponse>), (StatusCode, Json<AppError>)> {
    todo!()
    // let session = session_service::create_session(&state, payload)
    //     .await
    //     .map_err(session_err)?;
    // Ok((StatusCode::CREATED, Json(SessionResponse::from(&session))))
}

async fn list_sessions(
    State(state): State<AppState_>,
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
    State(state): State<AppState_>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SessionDetailResponse>> {
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
    State(state): State<AppState_>,
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
    State(state): State<AppState_>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<AppError>)> {
    todo!()
    // session_service::delete_session(&state, id)
    //     .await
    //     .map_err(|e| AppError::internal(e.to_string()))?;
    // Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use axum::response::Response;
    use serde_json::{Value, json};
    use tempfile::TempDir;
    use tower::ServiceExt;
    use uuid::Uuid;

    use crate::state::AppState;

    fn test_database_url(temp_dir: &TempDir) -> String {
        format!("sqlite://{}", temp_dir.path().join("app.db").display())
    }

    // async fn test_app(temp_dir: &TempDir) -> (axum::Router, Arc<AppState>) {
    //     let database_url = test_database_url(temp_dir);
    //     let state = Arc::new(
    //         AppState::new_without_bootstrap(&database_url)
    //             .await
    //             .expect("state should be created"),
    //     );
    //     let app = super::router(Arc::clone(&state)).into();
    //     (app, state)
    // }

    async fn post_json(app: &axum::Router, uri: &str, body: Value) -> Response {
        app.clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(uri)
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_vec(&body).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap()
    }

    async fn get_req(app: &axum::Router, uri: &str) -> Response {
        app.clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(uri)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
    }

    async fn delete_req(app: &axum::Router, uri: &str) -> Response {
        app.clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(uri)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
    }

    async fn response_json(resp: Response) -> Value {
        let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    async fn create_agent(app: &axum::Router) -> Uuid {
        let resp = post_json(
            app,
            "/agents",
            json!({
                "spec": {
                    "lm": "gpt-4.1",
                    "instruction": null,
                    "tools": []
                }
            }),
        )
        .await;
        let body = response_json(resp).await;
        Uuid::parse_str(body["id"].as_str().expect("agent id must exist"))
            .expect("agent id must be uuid")
    }

    // async fn create_provider_profile(
    //     state: &AppState,
    //     name: &str,
    //     schema: &str,
    //     is_default: bool,
    // ) -> Uuid {
    //     create_provider_profile_with_url(state, name, schema, "https://example.com/v1", is_default)
    //         .await
    // }

    // async fn create_provider_profile_with_url(
    //     state: &AppState,
    //     name: &str,
    //     schema: &str,
    //     url: &str,
    //     is_default: bool,
    // ) -> Uuid {
    //     use ailoy::agent::AgentProvider;
    //     use ailoy::lang_model::{LangModelAPISchema, LangModelProvider};
    //     use std::collections::BTreeMap;

    //     let schema_val = match schema {
    //         "chat_completion" => LangModelAPISchema::ChatCompletion,
    //         "anthropic" => LangModelAPISchema::Anthropic,
    //         "gemini" => LangModelAPISchema::Gemini,
    //         "openai" => LangModelAPISchema::OpenAI,
    //         _ => panic!("unknown schema: {schema}"),
    //     };
    //     let lm = LangModelProvider::API {
    //         schema: schema_val,
    //         url: url::Url::parse(url).expect("valid url"),
    //         api_key: Some("secret-key".to_string()),
    //         max_tokens: None,
    //     };
    //     let provider = AgentProvider {
    //         models: BTreeMap::from([("*".to_string(), lm)]),
    //         tools: vec![],
    //     };

    //     state
    //         .repository
    //         .create_provider_profile(name.to_string(), provider, is_default)
    //         .await
    //         .expect("provider profile should be created")
    //         .id
    // }

    // #[tokio::test]
    // async fn create_agent_rejects_provider_field() {
    //     let temp_dir = TempDir::new().expect("temp dir should be created");
    //     let (app, _state) = test_app(&temp_dir).await;

    //     let resp = post_json(
    //         &app,
    //         "/agents",
    //         json!({
    //             "spec": {
    //                 "lm": "gpt-4.1",
    //                 "instruction": null,
    //                 "tools": []
    //             },
    //             "provider": {
    //                 "lm": {
    //                     "type": "api",
    //                     "schema": "chat_completion",
    //                     "url": "https://api.openai.com/v1/chat/completions",
    //                     "api_key": "secret"
    //                 },
    //                 "tools": []
    //             }
    //         }),
    //     )
    //     .await;
    //     assert_eq!(resp.status(), StatusCode::UNPROCESSABLE_ENTITY);
    // }

    // #[tokio::test]
    // async fn delete_session_removes_session_and_close_route_is_absent() {
    //     let temp_dir = TempDir::new().expect("temp dir should be created");
    //     let (app, state) = test_app(&temp_dir).await;

    //     let agent_id = create_agent(&app).await;
    //     let profile_id =
    //         create_provider_profile(&state, "openai-default", "chat_completion", true).await;

    //     let session_body = response_json(
    //         post_json(
    //             &app,
    //             "/sessions",
    //             json!({
    //                 "agent_id": agent_id,
    //                 "provider_profile_id": profile_id
    //             }),
    //         )
    //         .await,
    //     )
    //     .await;
    //     let session_id = session_body["id"]
    //         .as_str()
    //         .expect("session id must exist")
    //         .to_string();

    //     // /close endpoint does not exist on this API
    //     let close_resp = post_json(&app, &format!("/sessions/{session_id}/close"), json!({})).await;
    //     assert_eq!(close_resp.status(), StatusCode::NOT_FOUND);

    //     let delete_resp = delete_req(&app, &format!("/sessions/{session_id}")).await;
    //     assert_eq!(delete_resp.status(), StatusCode::NO_CONTENT);

    //     let get_resp = get_req(&app, &format!("/sessions/{session_id}")).await;
    //     assert_eq!(get_resp.status(), StatusCode::NOT_FOUND);
    // }
}
