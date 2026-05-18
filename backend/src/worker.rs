//! Automation worker loop. Picks up queued runs and executes prompts
//! against the router agent in the run's session.

use std::{sync::Arc, time::Duration};

use ailoy::message::{Message, Part, Role};
use chrono::Utc;
use futures_util::StreamExt;
use serde_json::json;

use crate::{
    handlers::session::{build_agent, build_sandbox},
    model::{EventKind, RunStatus},
    repository::DbAutomationRun,
    state::AppState,
};

const POLL_INTERVAL: Duration = Duration::from_secs(1);
const LEASE_MINUTES: i64 = 5;

/// Spawn `count` independent worker tasks. Each loops claim → execute.
/// No shutdown plumbing yet — tokio reaps tasks on process exit.
pub fn spawn_workers(state: Arc<AppState>, count: usize) {
    for idx in 0..count {
        let state = state.clone();
        tokio::spawn(async move { worker_loop(state, idx).await });
    }
    tracing::info!(count, "automation workers spawned");
}

async fn worker_loop(state: Arc<AppState>, idx: usize) {
    loop {
        match try_claim_and_execute(&state).await {
            Ok(true) => continue,
            Ok(false) => tokio::time::sleep(POLL_INTERVAL).await,
            Err(e) => {
                tracing::error!(worker = idx, "claim failed: {e}");
                tokio::time::sleep(POLL_INTERVAL).await;
            }
        }
    }
}

async fn try_claim_and_execute(state: &Arc<AppState>) -> Result<bool, String> {
    let now = Utc::now();
    let lease_until = now + chrono::Duration::minutes(LEASE_MINUTES);
    let claimed = state
        .repository
        .claim_due_run(now, lease_until)
        .await
        .map_err(|e| e.to_string())?;
    let Some(run) = claimed else { return Ok(false) };

    tracing::info!(run = %run.id, "claimed run");
    let result = execute_run(state, &run).await;

    let (kind, payload) = match &result {
        Ok(()) => (EventKind::Succeeded, None),
        Err(e) => (EventKind::Failed, Some(json!({ "error": e }))),
    };
    let _ = state
        .repository
        .append_event(run.id, kind, 1, payload.as_ref())
        .await;

    let final_status = match &result {
        Ok(()) => RunStatus::Succeeded,
        Err(_) => RunStatus::Failed,
    };
    if let Err(e) = state
        .repository
        .update_run_status(run.id, final_status, true)
        .await
    {
        tracing::error!(run = %run.id, "failed to update final status: {e}");
    }

    match &result {
        Ok(()) => tracing::info!(run = %run.id, "run succeeded"),
        Err(e) => tracing::warn!(run = %run.id, "run failed: {e}"),
    }
    Ok(true)
}

async fn execute_run(state: &Arc<AppState>, run: &DbAutomationRun) -> Result<(), String> {
    let repo = &state.repository;
    let automation = repo
        .get_automation(run.automation_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("automation {} not found", run.automation_id))?;

    repo.append_event(run.id, EventKind::Started, 1, None)
        .await
        .map_err(|e| e.to_string())?;

    // Build sandbox + agent for this run's session. Insert into AppState so
    // subsequent HTTP calls can resolve the same agent instance.
    let sandbox = build_sandbox(state, automation.project_id, run.session_id).await?;
    let agent = build_agent(sandbox).await?;
    state.insert_agent(run.session_id, agent);

    for (idx, prompt) in automation.prompts.iter().enumerate() {
        let step_index = idx as i64;
        repo.append_event(
            run.id,
            EventKind::StepStarted,
            1,
            Some(&json!({ "step_index": step_index })),
        )
        .await
        .map_err(|e| e.to_string())?;

        let agent_arc = state
            .get_agent(&run.session_id)
            .ok_or_else(|| format!("agent missing for session {}", run.session_id))?;
        let mut agent = agent_arc.lock().await;
        let prev_len = agent.get_history().len();

        let msg = Message::new(Role::User).with_contents([Part::text(prompt.clone())]);
        let mut stream = agent.run(msg);
        let mut step_err: Option<String> = None;
        while let Some(item) = stream.next().await {
            if let Err(e) = item {
                step_err = Some(e.to_string());
                break;
            }
        }
        drop(stream);

        let new_msgs = agent.get_history()[prev_len..].to_vec();
        drop(agent);

        repo.append_messages(run.session_id, &new_msgs)
            .await
            .map_err(|e| e.to_string())?;

        if let Some(err) = step_err {
            return Err(format!("step {step_index} failed: {err}"));
        }

        repo.append_event(
            run.id,
            EventKind::StepFinished,
            1,
            Some(&json!({ "step_index": step_index })),
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
