//! `reflect-agent` — single lead agent built via `ailoy::agent::AgentBuilder`,
//! with a deterministic post-hoc verify pass over each turn's history slice.

mod agent;
mod provider;
mod reflect;
mod verify;

pub use agent::{
    DEFAULT_MODEL, ForcedReflectOutcome, HybridReflectOutcome, build_agent, build_agent_with_mode,
    run_with_forced_reflect, run_with_hybrid, run_with_verify,
};
pub use provider::register_provider_from_env;
pub use reflect::{
    DEFAULT_REFLECT_MODEL, HYBRID_LOW_CONFIDENCE_THRESHOLD, RETRY_BUDGET, ReflectMode,
    ReflectVerdict, reflect_call,
};
pub use verify::{BashFailureReason, Issue, VerifyConfig, VerifyReport, verify_run};
