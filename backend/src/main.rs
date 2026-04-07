mod agent;
mod handlers;
mod models;
mod prompt;
mod repository;
mod services;
mod state;

use std::sync::Arc;

use aide::axum::ApiRouter;
use aide::openapi::{Info, OpenApi};
use aide::scalar::Scalar;
use axum::Extension;
use axum::response::IntoResponse;
use tower_http::cors::{Any, CorsLayer};

use crate::state::AppState;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_env("LOG_LEVEL")
                .or_else(|_| tracing_subscriber::EnvFilter::try_from_default_env())
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".to_string());
    let app_state = Arc::new(AppState::new().await?);

    aide::generate::on_error(|error| {
        tracing::warn!("aide schema error: {error}");
    });
    aide::generate::extract_schemas(true);

    let mut openapi = OpenApi {
        info: Info {
            title: "AgentWebUI API".to_string(),
            version: "0.1.0".to_string(),
            ..Default::default()
        },
        ..Default::default()
    };

    // TODO: Replace Any::new() with specific origins for production
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = handlers::router(app_state)
        .finish_api(&mut openapi)
        .merge(
            ApiRouter::new()
                .route("/api-docs/openapi.json", axum::routing::get(serve_openapi))
                .route("/docs", axum::routing::get(Scalar::new("/api-docs/openapi.json").axum_handler()))
        )
        .layer(Extension(Arc::new(openapi)))
        .layer(cors);

    tracing::info!("API docs available at http://{bind_addr}/docs");

    tracing::info!("server listening on http://{bind_addr}");
    tracing::info!("API docs: http://{bind_addr}/docs");

    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    axum::serve(listener, app).await
}

async fn serve_openapi(Extension(openapi): Extension<Arc<OpenApi>>) -> impl IntoResponse {
    axum::Json(openapi.as_ref().clone())
}
