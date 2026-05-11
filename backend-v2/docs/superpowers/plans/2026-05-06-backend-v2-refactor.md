# backend-v2 Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure backend-v2 for maintainability: fix the create_user_admin is_active bug, split the god-file router.rs into focused handler modules, move validate_password into the auth crate, introduce versioned sqlx migrations, and replace fragile dynamic SQL with QueryBuilder.

**Architecture:** Handlers split into `src/handlers/{auth,user,session}.rs`; `router.rs` becomes a pure routing table. The auth module owns all password logic. Schema versioning moves from inline DDL inside `SqliteRepository::migrate()` to files under `migrations/` consumed by `sqlx::migrate!()`. Dynamic UPDATE SQL in `update_user` switches to `sqlx::QueryBuilder`.

**Tech Stack:** Rust, axum 0.8, sqlx 0.8.6 (SQLite + macros feature), aide (OpenAPI), argon2, jsonwebtoken, thiserror

---

## File Map

### Created
- `src/handlers/mod.rs` — re-exports handler submodules
- `src/handlers/auth.rs` — `signup`, `login` handlers
- `src/handlers/user.rs` — `/me` and `/admin/users` handlers
- `src/handlers/session.rs` — session lifecycle, message, SSE stream handlers + private helpers
- `migrations/0001_create_sessions.sql` — sessions + session_messages DDL
- `migrations/0002_create_users.sql` — users table DDL

### Modified
- `src/repository/mod.rs` — add `is_active` to `NewUser`, add `Migration` error variant, switch to `sqlx::migrate!()`
- `src/repository/sqlite.rs` — remove `migrate()`, fix `create_user` INSERT, rewrite `update_user` with QueryBuilder, update unit test helper
- `src/auth/password.rs` — add `validate_password` + `MIN_PASSWORD_LEN`
- `src/auth/mod.rs` — export `validate_password`
- `src/router.rs` — pure routing only, delegate to `handlers::*`
- `src/lib.rs` — add `pub mod handlers`
- `src/model/user.rs` — add `JsonSchema` to `UserListQuery`
- `src/main.rs` — add `is_active: true` to all `NewUser` construction sites
- `Cargo.toml` — add `macros` to sqlx features

---

## Task 1: Fix `create_user_admin` is_active bug

**Files:**
- Modify: `src/repository/mod.rs`
- Modify: `src/repository/sqlite.rs`
- Modify: `src/router.rs`
- Modify: `src/main.rs`

- [ ] **Step 1: Add `is_active` to `NewUser` in `src/repository/mod.rs`**

Replace the `NewUser` struct:

```rust
pub struct NewUser {
    pub id: Uuid,
    pub username: String,
    pub password_hash: String,
    pub role: Role,
    pub display_name: Option<String>,
    pub is_active: bool,
}
```

- [ ] **Step 2: Update `create_user` INSERT in `src/repository/sqlite.rs`**

Replace the entire `create_user` method:

```rust
pub async fn create_user(&self, user: NewUser) -> RepositoryResult<DbUser> {
    let now = Self::now_string();
    sqlx::query(
        "INSERT INTO users (id, username, password_hash, role, display_name, is_active, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
    )
    .bind(user.id.to_string())
    .bind(&user.username)
    .bind(&user.password_hash)
    .bind(user.role.as_str())
    .bind(&user.display_name)
    .bind(if user.is_active { 1i64 } else { 0i64 })
    .bind(&now)
    .bind(&now)
    .execute(&self.pool)
    .await
    .map_err(|e| Self::map_db_error(e, "username"))?;

    Ok(DbUser {
        id: user.id,
        username: user.username,
        password_hash: user.password_hash,
        role: user.role,
        display_name: user.display_name,
        is_active: user.is_active,
        created_at: Self::parse_timestamp(now.clone(), "users.created_at")?,
        updated_at: Self::parse_timestamp(now, "users.updated_at")?,
    })
}
```

- [ ] **Step 3: Fix `signup` in `src/router.rs` — add `is_active: true` to `NewUser`**

In the `signup` handler, update the `create_user` call:

```rust
let user = state
    .repository
    .create_user(NewUser {
        id,
        username: payload.username,
        password_hash,
        role: crate::auth::Role::User,
        display_name: payload.display_name,
        is_active: true,
    })
    .await
    .map_err(|e| match e {
        RepositoryError::UniqueViolation(_) => AppError::conflict("username already taken"),
        other => AppError::internal(other.to_string()),
    })?;
```

- [ ] **Step 4: Fix `create_user_admin` in `src/router.rs` — remove two-phase commit**

Replace the entire `create_user_admin` function:

```rust
async fn create_user_admin(
    State(state): State<Arc<AppState>>,
    Extension(_auth): Extension<AuthUser>,
    Json(payload): Json<AdminCreateUserRequest>,
) -> ApiResult<(StatusCode, Json<UserResponse>)> {
    validate_password(&payload.password)?;

    let password_hash = hash_password(&payload.password)?;
    let id = Uuid::new_v4();
    let role = payload.role.unwrap_or(crate::auth::Role::User);
    let is_active = payload.is_active.unwrap_or(true);

    let user = state
        .repository
        .create_user(NewUser {
            id,
            username: payload.username,
            password_hash,
            role,
            display_name: payload.display_name,
            is_active,
        })
        .await
        .map_err(|e| match e {
            RepositoryError::UniqueViolation(_) => AppError::conflict("username already taken"),
            other => AppError::internal(other.to_string()),
        })?;

    tracing::info!(%id, username = %user.username, "admin created user");

    Ok((StatusCode::CREATED, Json(UserResponse::from(user))))
}
```

- [ ] **Step 5: Update `NewUser` construction sites in `src/main.rs`**

In `run_create_admin`, add `is_active: true`:

```rust
let result = repo
    .create_user(NewUser {
        id: Uuid::new_v4(),
        username: username.clone(),
        password_hash,
        role: auth::Role::Admin,
        display_name,
        is_active: true,
    })
    .await;
```

In `bootstrap_admin_if_needed`, add `is_active: true`:

```rust
match repo
    .create_user(NewUser {
        id: Uuid::new_v4(),
        username: u.clone(),
        password_hash,
        role: auth::Role::Admin,
        display_name: None,
        is_active: true,
    })
    .await
```

- [ ] **Step 6: Update `new_user` test helper in `src/repository/sqlite.rs`**

```rust
fn new_user(username: &str, role: UserRole) -> NewUser {
    NewUser {
        id: Uuid::new_v4(),
        username: username.to_string(),
        password_hash: "hash".to_string(),
        role,
        display_name: None,
        is_active: true,
    }
}
```

- [ ] **Step 7: Run tests**

```bash
cd /Users/haejoonkim/Desktop/workspace/BrekkyLab/agent-k/backend-v2
cargo test 2>&1 | tail -20
```

Expected: all tests pass, no compilation errors.

- [ ] **Step 8: Commit**

```bash
git add src/repository/mod.rs src/repository/sqlite.rs src/router.rs src/main.rs
git commit -m "fix: pass is_active through NewUser, eliminating two-phase user creation"
```

---

## Task 2: Move `validate_password` to auth module

**Files:**
- Modify: `src/auth/password.rs`
- Modify: `src/auth/mod.rs`
- Modify: `src/router.rs`

- [ ] **Step 1: Add `validate_password` and `MIN_PASSWORD_LEN` to `src/auth/password.rs`**

Add at the top of the file, before `hash_password`:

```rust
pub const MIN_PASSWORD_LEN: usize = 8;

pub fn validate_password(password: &str) -> Result<(), crate::error::ApiError> {
    if password.len() < MIN_PASSWORD_LEN {
        return Err(crate::error::AppError::bad_request(format!(
            "password must be at least {MIN_PASSWORD_LEN} characters"
        )));
    }
    Ok(())
}
```

- [ ] **Step 2: Export from `src/auth/mod.rs`**

Update the `pub use` line for `password`:

```rust
pub use password::{hash_password, validate_password, verify_password};
```

- [ ] **Step 3: Remove `MIN_PASSWORD_LEN` and `validate_password` from `src/router.rs`**

Delete these lines from router.rs:

```rust
const MIN_PASSWORD_LEN: usize = 8;

fn validate_password(password: &str) -> Result<(), crate::error::ApiError> {
    if password.len() < MIN_PASSWORD_LEN {
        return Err(AppError::bad_request(format!(
            "password must be at least {MIN_PASSWORD_LEN} characters"
        )));
    }
    Ok(())
}
```

Update the `use crate::auth` import in router.rs to include `validate_password`:

```rust
use crate::{
    auth::{AuthUser, admin_required, auth_required, hash_password, validate_password, verify_password},
    error::{ApiResult, AppError},
    model::{
        CreateSessionRequest, SendMessageRequest, SendMessageResponse, SessionResponse,
        user::{
            AdminCreateUserRequest, AdminUpdateUserRequest, LoginRequest, LoginResponse,
            SignupRequest, UpdateMeRequest, UserListQuery, UserListResponse, UserResponse,
        },
    },
    repository::{NewUser, RepositoryError, UpdateUser},
    state::AppState,
};
```

- [ ] **Step 4: Run tests**

```bash
cargo test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/auth/password.rs src/auth/mod.rs src/router.rs
git commit -m "refactor: move validate_password into auth module"
```

---

## Task 3: Split `router.rs` into `handlers/`

**Files:**
- Create: `src/handlers/mod.rs`
- Create: `src/handlers/auth.rs`
- Create: `src/handlers/user.rs`
- Create: `src/handlers/session.rs`
- Modify: `src/router.rs`
- Modify: `src/lib.rs`

- [ ] **Step 1: Create `src/handlers/mod.rs`**

```rust
pub mod auth;
pub mod session;
pub mod user;
```

- [ ] **Step 2: Create `src/handlers/auth.rs`**

```rust
use std::sync::Arc;

use axum::{Json, extract::State, http::StatusCode};
use uuid::Uuid;

use crate::{
    auth::{Role, hash_password, validate_password, verify_password},
    error::{ApiResult, AppError},
    model::user::{LoginRequest, LoginResponse, SignupRequest, UserResponse},
    repository::{NewUser, RepositoryError},
    state::AppState,
};

pub async fn signup(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SignupRequest>,
) -> ApiResult<(StatusCode, Json<UserResponse>)> {
    validate_password(&payload.password)?;

    let password_hash = hash_password(&payload.password)?;
    let id = Uuid::new_v4();

    let user = state
        .repository
        .create_user(NewUser {
            id,
            username: payload.username,
            password_hash,
            role: Role::User,
            display_name: payload.display_name,
            is_active: true,
        })
        .await
        .map_err(|e| match e {
            RepositoryError::UniqueViolation(_) => AppError::conflict("username already taken"),
            other => AppError::internal(other.to_string()),
        })?;

    tracing::info!(%id, username = %user.username, "user signed up");

    Ok((StatusCode::CREATED, Json(UserResponse::from(user))))
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> ApiResult<Json<LoginResponse>> {
    let user = state
        .repository
        .get_user_by_username(&payload.username)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::unauthorized("invalid username or password"))?;

    if !user.is_active {
        return Err(AppError::forbidden("account is deactivated"));
    }

    if !verify_password(&payload.password, &user.password_hash)? {
        return Err(AppError::unauthorized("invalid username or password"));
    }

    let access_token = state
        .jwt
        .encode(user.id, user.username.clone(), user.role.clone())?;

    tracing::info!(id = %user.id, username = %user.username, "user logged in");

    Ok(Json(LoginResponse {
        token_type: "Bearer".to_string(),
        expires_in: state.jwt.expiry_secs,
        user: UserResponse::from(user),
        access_token,
    }))
}
```

- [ ] **Step 3: Create `src/handlers/user.rs`**

```rust
use std::sync::Arc;

use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use uuid::Uuid;

use crate::{
    auth::{AuthUser, Role, hash_password, validate_password, verify_password},
    error::{ApiResult, AppError},
    model::user::{
        AdminCreateUserRequest, AdminUpdateUserRequest, UpdateMeRequest, UserListQuery,
        UserListResponse, UserResponse,
    },
    repository::{NewUser, RepositoryError, UpdateUser},
    state::AppState,
};

pub async fn get_me(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
) -> ApiResult<Json<UserResponse>> {
    let user = state
        .repository
        .get_user_by_id(auth.id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("user not found"))?;

    Ok(Json(UserResponse::from(user)))
}

pub async fn update_me(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Json(payload): Json<UpdateMeRequest>,
) -> ApiResult<Json<UserResponse>> {
    let new_password_hash = if let Some(ref new_password) = payload.password {
        validate_password(new_password)?;

        let current_password = payload.current_password.as_deref().ok_or_else(|| {
            AppError::bad_request("current_password is required to change password")
        })?;

        let user = state
            .repository
            .get_user_by_id(auth.id)
            .await
            .map_err(|e| AppError::internal(e.to_string()))?
            .ok_or_else(|| AppError::not_found("user not found"))?;

        if !verify_password(current_password, &user.password_hash)? {
            return Err(AppError::unauthorized("current password is incorrect"));
        }

        Some(hash_password(new_password)?)
    } else {
        None
    };

    let updated = state
        .repository
        .update_user(
            auth.id,
            UpdateUser {
                display_name: payload.display_name,
                password_hash: new_password_hash,
                role: None,
                is_active: None,
            },
        )
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("user not found"))?;

    Ok(Json(UserResponse::from(updated)))
}

pub async fn list_users(
    State(state): State<Arc<AppState>>,
    Extension(_auth): Extension<AuthUser>,
    Query(q): Query<UserListQuery>,
) -> ApiResult<Json<UserListResponse>> {
    let page = q.page.unwrap_or(1);
    let size = q.size.unwrap_or(20);

    let (users, total) = state
        .repository
        .list_users(page, size)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(Json(UserListResponse {
        items: users.into_iter().map(UserResponse::from).collect(),
        total,
    }))
}

pub async fn create_user_admin(
    State(state): State<Arc<AppState>>,
    Extension(_auth): Extension<AuthUser>,
    Json(payload): Json<AdminCreateUserRequest>,
) -> ApiResult<(StatusCode, Json<UserResponse>)> {
    validate_password(&payload.password)?;

    let password_hash = hash_password(&payload.password)?;
    let id = Uuid::new_v4();
    let role = payload.role.unwrap_or(Role::User);
    let is_active = payload.is_active.unwrap_or(true);

    let user = state
        .repository
        .create_user(NewUser {
            id,
            username: payload.username,
            password_hash,
            role,
            display_name: payload.display_name,
            is_active,
        })
        .await
        .map_err(|e| match e {
            RepositoryError::UniqueViolation(_) => AppError::conflict("username already taken"),
            other => AppError::internal(other.to_string()),
        })?;

    tracing::info!(%id, username = %user.username, "admin created user");

    Ok((StatusCode::CREATED, Json(UserResponse::from(user))))
}

pub async fn get_user_admin(
    State(state): State<Arc<AppState>>,
    Extension(_auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<UserResponse>> {
    let user = state
        .repository
        .get_user_by_id(id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("user not found"))?;

    Ok(Json(UserResponse::from(user)))
}

pub async fn update_user_admin(
    State(state): State<Arc<AppState>>,
    Extension(_auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(payload): Json<AdminUpdateUserRequest>,
) -> ApiResult<Json<UserResponse>> {
    let new_password_hash = payload
        .password
        .as_deref()
        .map(|p| {
            validate_password(p)?;
            hash_password(p)
        })
        .transpose()?;

    let updated = state
        .repository
        .update_user(
            id,
            UpdateUser {
                display_name: payload.display_name,
                password_hash: new_password_hash,
                role: payload.role,
                is_active: payload.is_active,
            },
        )
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("user not found"))?;

    Ok(Json(UserResponse::from(updated)))
}

pub async fn delete_user_admin(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    if auth.id == id {
        return Err(AppError::bad_request("cannot delete your own account"));
    }

    let deleted = state
        .repository
        .delete_user(id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    if !deleted {
        return Err(AppError::not_found("user not found"));
    }

    tracing::info!(target_user_id = %id, by = %auth.id, "admin deleted user");

    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 4: Create `src/handlers/session.rs`**

Note: `DEFAULT_MODEL` is corrected from `"openai/gpt-5.4-mini"` to `"openai/gpt-4o-mini"`.

```rust
use std::{convert::Infallible, sync::Arc};

use ailoy::{
    agent::{Agent, AgentBuilder, AgentCard},
    message::{Message, MessageOutput, Part, Role},
    runenv::{Sandbox, SandboxConfig},
};
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::sse::{Event, KeepAlive, Sse},
};
use chrono::Utc;
use futures_util::StreamExt;
use speedwagon::SpeedwagonSpec;
use uuid::Uuid;

use crate::{
    error::{ApiResult, AppError},
    model::{CreateSessionRequest, SendMessageRequest, SendMessageResponse, SessionResponse},
    state::AppState,
};

const DEFAULT_MODEL: &str = "openai/gpt-4o-mini";

fn sandbox_name_for(id: &Uuid) -> String {
    let s = id.simple().to_string();
    format!("session-{}", &s[..12])
}

async fn build_agent(sandbox: Sandbox) -> Result<Agent, String> {
    let sw_card = AgentCard {
        name: "speedwagon".into(),
        description: "Search the knowledge base for answers. \
            This tool has access to uploaded documents that may contain \
            information the model doesn't have. \
            Use it for any question that could be answered from the knowledge base."
            .into(),
        skills: vec![],
    };
    let sw_spec = SpeedwagonSpec::new().card(sw_card.clone()).into_spec();

    AgentBuilder::new(DEFAULT_MODEL)
        .instruction(concat!(
            "You are a versatile assistant with access to code execution tools ",
            "(bash, python), web search, and a knowledge base (speedwagon). ",
            "You MUST use the speedwagon tool to search the document corpus ",
            "before answering ANY factual question — even if you think you already know the answer. ",
            "The corpus contains authoritative information that may differ from your training data. ",
            "Use bash and python tools for computation, data analysis, and code execution tasks. ",
            "Only skip tools for greetings or casual conversation.",
        ))
        .tool("bash")
        .tool("python_repl")
        .tool("web_search")
        .runenv(sandbox)
        .subagent(sw_spec)
        .build()
        .await
        .map_err(|e| e.to_string())
}

pub async fn resolve_agent(
    state: &Arc<AppState>,
    id: Uuid,
) -> ApiResult<Arc<tokio::sync::Mutex<Agent>>> {
    if let Some(arc) = state.get_agent(&id) {
        return Ok(arc);
    }

    let session_exists = state
        .repository
        .get_session(id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .is_some();

    if !session_exists {
        return Err(AppError::not_found("session not found"));
    }

    let history = state
        .repository
        .get_messages(id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let sandbox_name = sandbox_name_for(&id);
    let cfg = SandboxConfig {
        name: Some(sandbox_name),
        persist: true,
        ..Default::default()
    };
    let sandbox = Sandbox::new(cfg)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let mut agent = build_agent(sandbox)
        .await
        .map_err(|e| AppError::internal(e))?;

    agent.state.history = history;
    tracing::info!(%id, "agent lazy-created with history restored");

    if let Some(existing) = state.get_agent(&id) {
        return Ok(existing);
    }
    state.insert_agent(id, agent);
    Ok(state.get_agent(&id).unwrap())
}

pub async fn create_session(
    State(state): State<Arc<AppState>>,
    Json(_payload): Json<CreateSessionRequest>,
) -> ApiResult<(StatusCode, Json<SessionResponse>)> {
    let id = Uuid::new_v4();
    let sandbox_name = sandbox_name_for(&id);

    let cfg = SandboxConfig {
        name: Some(sandbox_name.clone()),
        persist: true,
        ..Default::default()
    };
    let sandbox = Sandbox::new(cfg)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let agent = build_agent(sandbox)
        .await
        .map_err(|e| AppError::internal(e))?;

    let now = Utc::now();
    state
        .repository
        .create_session(id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    state.insert_agent(id, agent);

    tracing::info!(%id, sandbox = %sandbox_name, "session created");

    Ok((
        StatusCode::CREATED,
        Json(SessionResponse {
            id,
            created_at: now,
            updated_at: now,
        }),
    ))
}

pub async fn delete_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    if state
        .repository
        .get_session(id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .is_none()
    {
        return Err(AppError::not_found("session not found"));
    }

    state
        .repository
        .delete_session(id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    let agent_arc = state.remove_agent(&id);

    if let Some(arc) = agent_arc {
        drop(arc.lock().await);
        drop(arc);
    }

    let sandbox_name = sandbox_name_for(&id);
    if let Err(e) = ailoy::runenv::remove_persisted(&sandbox_name).await {
        tracing::warn!(%id, "failed to remove persisted sandbox: {e}");
    }

    tracing::info!(%id, "session deleted");
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_message_history(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Vec<Message>>> {
    if state
        .repository
        .get_session(id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .is_none()
    {
        return Err(AppError::not_found("session not found"));
    }
    let messages = state
        .repository
        .get_messages(id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    Ok(Json(messages))
}

pub async fn clear_message_history(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    if state
        .repository
        .get_session(id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .is_none()
    {
        return Err(AppError::not_found("session not found"));
    }
    state
        .repository
        .clear_messages(id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    if let Some(arc) = state.get_agent(&id) {
        arc.lock().await.state.history.clear();
    }

    tracing::info!(%id, "message history cleared");
    Ok(StatusCode::NO_CONTENT)
}

pub async fn send_message(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<SendMessageRequest>,
) -> ApiResult<Json<SendMessageResponse>> {
    let agent_arc = resolve_agent(&state, id).await?;

    let prev_len = agent_arc.lock().await.get_history().len();

    let outputs = {
        let mut agent = agent_arc.lock().await;
        let msg = Message::new(Role::User).with_contents([Part::text(payload.content)]);
        let mut stream = agent.run(msg);
        let mut outputs: Vec<MessageOutput> = Vec::new();
        while let Some(item) = stream.next().await {
            outputs.push(item.map_err(|e| AppError::internal(e.to_string()))?);
        }
        outputs
    };

    let new_messages = {
        let agent = agent_arc.lock().await;
        agent.get_history()[prev_len..].to_vec()
    };
    state
        .repository
        .append_messages(id, &new_messages)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(Json(outputs))
}

pub async fn send_message_stream(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<SendMessageRequest>,
) -> ApiResult<Sse<impl futures_util::Stream<Item = Result<Event, Infallible>> + Send + 'static>> {
    let agent_arc = resolve_agent(&state, id).await?;
    let repo = state.repository.clone();
    let prev_len = agent_arc.lock().await.get_history().len();
    let content = payload.content;

    let stream = async_stream::stream! {
        let mut agent = agent_arc.lock().await;
        let msg = Message::new(Role::User).with_contents([Part::text(content)]);
        let mut run = agent.run(msg);

        while let Some(item) = run.next().await {
            match item {
                Ok(output) => {
                    let json = serde_json::to_string(&output)
                        .unwrap_or_else(|e| format!("{{\"error\":\"{e}}}", e = e));
                    yield Ok::<Event, Infallible>(
                        Event::default().event("message").data(json),
                    );
                }
                Err(e) => {
                    yield Ok(Event::default().event("error").data(e.to_string()));
                    return;
                }
            }
        }
        drop(run);

        let new_msgs = agent.get_history()[prev_len..].to_vec();
        if let Err(e) = repo.append_messages(id, &new_msgs).await {
            tracing::error!(%id, "failed to persist messages: {e}");
        }

        yield Ok(Event::default().event("done").data("[DONE]"));
    };

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}
```

- [ ] **Step 5: Replace `src/router.rs` with pure routing**

```rust
use std::sync::Arc;

use aide::axum::{
    ApiRouter,
    routing::{delete, post},
};
use axum::middleware;

use crate::{
    auth::{admin_required, auth_required},
    handlers,
    state::AppState,
};

pub fn get_router(state: Arc<AppState>) -> ApiRouter {
    let public_routes = ApiRouter::new()
        .api_route("/auth/signup", post(handlers::auth::signup))
        .api_route("/auth/login", post(handlers::auth::login));

    let me_routes = ApiRouter::new()
        .route(
            "/me",
            axum::routing::get(handlers::user::get_me).patch(handlers::user::update_me),
        )
        .layer(middleware::from_fn_with_state(state.clone(), auth_required));

    let admin_routes = ApiRouter::new()
        .route(
            "/admin/users",
            axum::routing::get(handlers::user::list_users)
                .post(handlers::user::create_user_admin),
        )
        .route(
            "/admin/users/{id}",
            axum::routing::get(handlers::user::get_user_admin)
                .patch(handlers::user::update_user_admin)
                .delete(handlers::user::delete_user_admin),
        )
        .layer(middleware::from_fn(admin_required))
        .layer(middleware::from_fn_with_state(state.clone(), auth_required));

    let session_routes = ApiRouter::new()
        .api_route("/sessions", post(handlers::session::create_session))
        .api_route("/sessions/{id}", delete(handlers::session::delete_session))
        .api_route(
            "/sessions/{id}/messages",
            post(handlers::session::send_message),
        )
        .route(
            "/sessions/{id}/messages/stream",
            axum::routing::post(handlers::session::send_message_stream),
        )
        .route(
            "/sessions/{id}/messages",
            axum::routing::get(handlers::session::get_message_history)
                .delete(handlers::session::clear_message_history),
        );

    ApiRouter::new()
        .merge(public_routes)
        .merge(me_routes)
        .merge(admin_routes)
        .merge(session_routes)
        .with_state(state)
}
```

- [ ] **Step 6: Add `pub mod handlers` to `src/lib.rs`**

```rust
pub mod auth;
pub mod error;
pub mod handlers;
pub mod model;
pub mod repository;
pub mod router;
pub mod state;
```

- [ ] **Step 7: Run tests**

```bash
cargo test 2>&1 | tail -20
```

Expected: all tests pass, no compilation errors.

- [ ] **Step 8: Commit**

```bash
git add src/handlers/ src/router.rs src/lib.rs
git commit -m "refactor: split router.rs into handlers/{auth,user,session}"
```

---

## Task 4: Switch to versioned sqlx migrations

**Files:**
- Modify: `Cargo.toml`
- Create: `migrations/0001_create_sessions.sql`
- Create: `migrations/0002_create_users.sql`
- Modify: `src/repository/mod.rs`
- Modify: `src/repository/sqlite.rs`

- [ ] **Step 1: Add `macros` to sqlx features in `Cargo.toml`**

```toml
sqlx = { version = "0.8.6", features = ["sqlite", "runtime-tokio-rustls", "macros"] }
```

- [ ] **Step 2: Create `migrations/0001_create_sessions.sql`**

```sql
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_messages (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    message_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_messages_session_seq
    ON session_messages(session_id, seq);
```

- [ ] **Step 3: Create `migrations/0002_create_users.sql`**

```sql
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    display_name TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
```

- [ ] **Step 4: Add `Migration` error variant and update `create_repository` in `src/repository/mod.rs`**

Add a new variant to `RepositoryError`:

```rust
#[derive(Debug, Error)]
pub enum RepositoryError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("migration error: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),

    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("invalid database URL: {0}")]
    InvalidDatabaseUrl(String),

    #[error("invalid data: {0}")]
    InvalidData(String),

    #[error("unique constraint violation on {0}")]
    UniqueViolation(String),
}
```

Update the import line to include `SqliteSynchronous`:

```rust
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
```

Replace `create_repository`:

```rust
pub async fn create_repository(db_url: &str) -> RepositoryResult<AppRepository> {
    let options = db_url
        .parse::<SqliteConnectOptions>()
        .map_err(|_| RepositoryError::InvalidDatabaseUrl(db_url.to_string()))?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5))
        .synchronous(SqliteSynchronous::Normal);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(Arc::new(SqliteRepository::new(pool)))
}
```

- [ ] **Step 5: Remove `migrate()` from `SqliteRepository` in `src/repository/sqlite.rs`**

Delete the entire `migrate()` method (the method starting with `pub async fn migrate` and its body including the PRAGMA and CREATE TABLE statements).

Also remove the unused import `use chrono::{DateTime, SecondsFormat, Utc};` → keep only what's needed (`DateTime`, `Utc` are still needed; `SecondsFormat` stays if `now_string` uses it — it does, so keep all three).

- [ ] **Step 6: Update unit test `make_repo` in `src/repository/sqlite.rs`**

Replace the `make_repo` function inside `#[cfg(test)]`:

```rust
async fn make_repo(db_url: &str) -> SqliteRepository {
    let options = db_url
        .parse::<SqliteConnectOptions>()
        .unwrap()
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(2)
        .connect_with(options)
        .await
        .unwrap();

    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    SqliteRepository::new(pool)
}
```

- [ ] **Step 7: Run tests**

```bash
cargo test 2>&1 | tail -20
```

Expected: all tests pass. The `_sqlx_migrations` tracking table is created automatically; `IF NOT EXISTS` guards ensure existing databases are safe to migrate.

- [ ] **Step 8: Commit**

```bash
git add Cargo.toml migrations/ src/repository/mod.rs src/repository/sqlite.rs
git commit -m "refactor: replace inline schema DDL with versioned sqlx migrations"
```

---

## Task 5: Replace `update_user` dynamic SQL with `QueryBuilder`

**Files:**
- Modify: `src/repository/sqlite.rs`

- [ ] **Step 1: Rewrite `update_user` to use `sqlx::QueryBuilder`**

Replace the entire `update_user` method:

```rust
pub async fn update_user(
    &self,
    id: Uuid,
    update: UpdateUser,
) -> RepositoryResult<Option<DbUser>> {
    let now = Self::now_string();

    let mut builder = sqlx::QueryBuilder::<sqlx::Sqlite>::new("UPDATE users SET updated_at = ");
    builder.push_bind(&now);

    if let Some(ref dn) = update.display_name {
        builder.push(", display_name = ").push_bind(dn);
    }
    if let Some(ref ph) = update.password_hash {
        builder.push(", password_hash = ").push_bind(ph);
    }
    if let Some(ref role) = update.role {
        builder.push(", role = ").push_bind(role.as_str());
    }
    if let Some(active) = update.is_active {
        builder
            .push(", is_active = ")
            .push_bind(if active { 1i64 } else { 0i64 });
    }

    builder.push(" WHERE id = ").push_bind(id.to_string());

    let result = builder.build().execute(&self.pool).await?;
    if result.rows_affected() == 0 {
        return Ok(None);
    }

    self.get_user_by_id(id).await
}
```

- [ ] **Step 2: Run tests**

```bash
cargo test 2>&1 | tail -20
```

Expected: all tests pass; `update_user_and_count_admins` and `list_users_pagination` tests exercise the updated method.

- [ ] **Step 3: Commit**

```bash
git add src/repository/sqlite.rs
git commit -m "refactor: use QueryBuilder for update_user dynamic SQL"
```

---

## Task 6: Minor fixes

**Files:**
- Modify: `src/model/user.rs`

- [ ] **Step 1: Add `JsonSchema` derive to `UserListQuery` in `src/model/user.rs`**

```rust
#[derive(Debug, Deserialize, JsonSchema)]
pub struct UserListQuery {
    pub page: Option<u32>,
    pub size: Option<u32>,
}
```

- [ ] **Step 2: Run tests and final check**

```bash
cargo test 2>&1 | tail -20
cargo clippy -- -D warnings 2>&1 | head -30
```

Expected: all tests pass, no clippy warnings.

- [ ] **Step 3: Commit**

```bash
git add src/model/user.rs
git commit -m "fix: add JsonSchema derive to UserListQuery"
```
