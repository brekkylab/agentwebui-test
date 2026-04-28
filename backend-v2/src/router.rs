use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use aide::axum::{ApiRouter, routing::post};
use ailoy::agent::{Agent, AgentBuilder, AgentCard, default_provider};
use ailoy::lang_model::LangModel;
use ailoy::tool::ToolSet;
use axum::{Json, extract::State, http::StatusCode};
use chrono::Utc;
use speedwagon::{SpeedwagonSpec, Store, build_toolset};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::{
    error::{ApiResult, AppError},
    model::{CreateSessionRequest, SessionResponse},
    state::AppState,
};

// NOTE: single-file approach은 build verification 단계의 의도적 선택.
// message streaming 엔드포인트 추가 시 speedwagon.rs 모듈로 추출 예정.
static STORE: OnceLock<Arc<Store>> = OnceLock::new();
static TOOLSET: OnceLock<ToolSet> = OnceLock::new();

fn speedwagon_store() -> Arc<Store> {
    STORE
        .get_or_init(|| {
            let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".speedwagon");
            Arc::new(Store::new(path).expect("speedwagon store init"))
        })
        .clone()
}

fn speedwagon_toolset() -> &'static ToolSet {
    TOOLSET.get_or_init(|| build_toolset(speedwagon_store()))
}

pub fn get_router(state: Arc<Mutex<AppState>>) -> ApiRouter {
    ApiRouter::new()
        .api_route("/sessions", post(create_session))
        .with_state(state)
}

async fn create_session(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(_payload): Json<CreateSessionRequest>,
) -> ApiResult<(StatusCode, Json<SessionResponse>)> {
    let provider_guard = default_provider().await;

    let sw_card = AgentCard {
        name: "speedwagon".into(),
        description: "Search a local document corpus and read passages. \
            Use when the user asks about documents, facts, quotes, citations, \
            or computations on document data."
            .into(),
        skills: vec![],
    };
    let sw_spec = SpeedwagonSpec::new().card(sw_card.clone()).into_spec();
    let sw_agent = Agent::try_with_tools(sw_spec, &*provider_guard, speedwagon_toolset())
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let main_model_name = "openai/gpt-4.5-mini";
    let model_id = main_model_name
        .split_once('/')
        .map(|(_, id)| id)
        .unwrap_or(main_model_name);
    let model_provider = provider_guard
        .get_model(main_model_name)
        .ok_or_else(|| AppError::internal(format!("No provider for model '{main_model_name}'")))?
        .clone();
    let model = LangModel::new(model_id.to_string(), model_provider);
    drop(provider_guard);

    let agent = AgentBuilder::new(model)
        .subagent(sw_card, sw_agent)
        .build()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    // Alternative: Speedwagon을 main agent로 직접 사용 (subagent 패턴 없이)
    // let spec = SpeedwagonSpec::new().model(main_model_name).card(sw_card).into_spec();
    // let agent = Agent::try_with_tools(spec, &*provider_guard, speedwagon_toolset())
    //     .await
    //     .map_err(|e| AppError::internal(e.to_string()))?;
    // drop(provider_guard);

    let id = Uuid::new_v4();
    let now = Utc::now();
    state.lock().await.insert_agent(id, agent);

    Ok((
        StatusCode::CREATED,
        Json(SessionResponse {
            id,
            created_at: now,
            updated_at: now,
        }),
    ))
}

// async fn list_sessions(
//     State(state): State<AppState_>,
//     Query(query): Query<ListSessionsQuery>,
// ) -> Result<Json<Vec<SessionResponse>>, (StatusCode, Json<AppError>)> {
//     let ListSessionsQuery {
//         agent_id,
//         include_messages,
//     } = query;

//     let sessions = state
//         .repository
//         .list_sessions(agent_id, include_messages.unwrap_or(false))
//         .await
//         .map_err(repo_err)?;
//     Ok(Json(sessions.iter().map(SessionResponse::from).collect()))
// }

// async fn get_session(
//     State(state): State<AppState_>,
//     Path(id): Path<Uuid>,
// ) -> ApiResult<Json<SessionDetailResponse>> {
//     match session_service::get_session_detail(&state, id)
//         .await
//         .map_err(session_err)?
//     {
//         Some(detail) => Ok(Json(detail)),
//         None => Err(AppError::not_found("session not found")),
//     }
// }

// async fn update_session(
//     State(state): State<AppState_>,
//     Path(id): Path<Uuid>,
//     Json(payload): Json<UpdateSessionRequest>,
// ) -> Result<Json<SessionResponse>, (StatusCode, Json<AppError>)> {
//     let session = session_service::update_session(&state, id, payload)
//         .await
//         .map_err(|e| AppError::internal(e.to_string()))?;
//     Ok(Json(SessionResponse::from(&session)))
// }

// async fn delete_session(
//     State(state): State<AppState_>,
//     Path(id): Path<Uuid>,
// ) -> Result<StatusCode, (StatusCode, Json<AppError>)> {
//     session_service::delete_session(&state, id)
//         .await
//         .map_err(|e| AppError::internal(e.to_string()))?;
//     Ok(StatusCode::NO_CONTENT)
// }
