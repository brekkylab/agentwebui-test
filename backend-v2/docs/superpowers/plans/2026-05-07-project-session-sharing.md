# Project / Session Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Project workspace concept with owner + member access model, move sessions under projects, add per-session share_mode (private / shared_readonly / shared_chat), and enforce chat-lock via `tokio::sync::Mutex::try_lock_owned()`.

**Architecture:** Three new DB tables (`projects`, `project_members`; sessions table rebuilt with FK columns). Repository methods handle all auth checks in SQL. Handlers call repo helpers then apply per-resource authorization logic. Lock enforcement reuses the existing `DashMap<Uuid, Arc<Mutex<Agent>>>` with `try_lock_owned()` for zero-overhead locking.

**Tech Stack:** Rust, axum 0.8, aide 0.14 (OpenAPI), sqlx 0.8 (SQLite), tokio, serde, schemars, uuid, chrono, async-stream

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Create | `migrations/0003_projects_and_sessions.sql` | Drop old sessions, recreate + add projects/members |
| Modify | `src/repository/mod.rs` | Add `DbProject`, `DbProjectMember`, `SessionAccess`, `ShareMode`; update `DbSession` |
| Modify | `src/error.rs` | Add `locked()` → 423 |
| Modify | `src/model/session.rs` | Update `SessionResponse`, add `UpdateSessionRequest` |
| Create | `src/model/project.rs` | Project/member request/response DTOs |
| Modify | `src/model/mod.rs` | Expose `project` module |
| Modify | `src/repository/sqlite.rs` | Update session methods + add project/member CRUD |
| Create | `src/handlers/project.rs` | All `/projects/*` handlers |
| Modify | `src/handlers/session.rs` | Auth + try_lock_owned + new routes |
| Modify | `src/handlers/mod.rs` | Expose `project` module |
| Modify | `src/handlers/auth.rs` | Create Personal project on signup |
| Modify | `src/auth/bootstrap.rs` | Create Personal project for bootstrap admin |
| Modify | `src/router.rs` | Register /projects routes; add auth_required on sessions |
| Modify | `tests/common/mod.rs` | Update + add helpers |
| Modify | `tests/auth_test.rs` | Fix for Personal project creation |
| Modify | `tests/message_history_persistence.rs` | Fix: authed session creation |
| Modify | `tests/sandbox_per_session.rs` | Fix: authed session creation |
| Modify | `tests/e2e_test.rs` | Fix: authed session creation |
| Create | `tests/project_test.rs` | Project + member CRUD tests |
| Create | `tests/session_authz_test.rs` | Session sharing + lock tests |

---

## Task 1: Migration + DB Types + error::locked()

**Files:**
- Create: `migrations/0003_projects_and_sessions.sql`
- Modify: `src/repository/mod.rs`
- Modify: `src/error.rs`

- [ ] **Step 1: Write migration file**

```sql
-- migrations/0003_projects_and_sessions.sql
DROP TABLE IF EXISTS session_messages;
DROP TABLE IF EXISTS sessions;

CREATE TABLE projects (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT,
    owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX idx_projects_owner ON projects(owner_id);

CREATE TABLE project_members (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    added_at   TEXT NOT NULL,
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX idx_project_members_user ON project_members(user_id);

CREATE TABLE sessions (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    creator_id  TEXT NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
    share_mode  TEXT NOT NULL DEFAULT 'private'
                CHECK (share_mode IN ('private', 'shared_readonly', 'shared_chat')),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_sessions_creator ON sessions(creator_id);

CREATE TABLE session_messages (
    seq          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_json TEXT NOT NULL,
    created_at   TEXT NOT NULL
);
CREATE INDEX idx_session_messages_session_seq ON session_messages(session_id, seq);
```

- [ ] **Step 2: Add ShareMode + new DB structs to `src/repository/mod.rs`**

Replace the existing `DbSession` struct and add new types. Full updated file (only the struct/type section — leave `create_repository*` functions intact):

```rust
// src/repository/mod.rs (new imports at top)
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
```

Add after `pub use sqlite::SqliteRepository;`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ShareMode {
    Private,
    SharedReadonly,
    SharedChat,
}

impl ShareMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            ShareMode::Private => "private",
            ShareMode::SharedReadonly => "shared_readonly",
            ShareMode::SharedChat => "shared_chat",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "private" => Some(ShareMode::Private),
            "shared_readonly" => Some(ShareMode::SharedReadonly),
            "shared_chat" => Some(ShareMode::SharedChat),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct DbProject {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct DbProjectMember {
    pub project_id: Uuid,
    pub user_id: Uuid,
    pub added_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub enum SessionAccess {
    Creator,
    ChatMember,
    ReadOnlyMember,
}
```

Replace the old `DbSession`:

```rust
#[derive(Debug, Clone)]
pub struct DbSession {
    pub id: Uuid,
    pub project_id: Uuid,
    pub creator_id: Uuid,
    pub share_mode: ShareMode,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

- [ ] **Step 3: Add `locked()` to `src/error.rs`**

Add after `conflict()`:

```rust
pub fn locked(msg: impl Into<String>) -> ApiError {
    (StatusCode::LOCKED, Json(Self::new(msg)))
}
```

- [ ] **Step 4: Verify compilation (ignoring broken session code)**

```bash
cd /path/to/backend-v2
cargo check 2>&1 | head -40
```

Expected: compile errors in `src/repository/sqlite.rs` and `src/handlers/session.rs` because `DbSession` shape changed. That is expected — will be fixed in Tasks 3 and 5.

---

## Task 2: Session + Project Model DTOs

**Files:**
- Modify: `src/model/session.rs`
- Create: `src/model/project.rs`
- Modify: `src/model/mod.rs`

- [ ] **Step 1: Replace `src/model/session.rs`**

```rust
use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::repository::{DbSession, ShareMode};

pub use crate::repository::ShareMode;

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateSessionRequest {}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateSessionRequest {
    pub share_mode: ShareMode,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct SessionResponse {
    pub id: Uuid,
    pub project_id: Uuid,
    pub creator_id: Uuid,
    pub share_mode: ShareMode,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<DbSession> for SessionResponse {
    fn from(s: DbSession) -> Self {
        Self {
            id: s.id,
            project_id: s.project_id,
            creator_id: s.creator_id,
            share_mode: s.share_mode,
            created_at: s.created_at,
            updated_at: s.updated_at,
        }
    }
}
```

- [ ] **Step 2: Create `src/model/project.rs`**

```rust
use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::repository::DbProject;

#[derive(Debug, Serialize, JsonSchema)]
pub struct ProjectResponse {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<DbProject> for ProjectResponse {
    fn from(p: DbProject) -> Self {
        Self {
            id: p.id,
            name: p.name,
            description: p.description,
            owner_id: p.owner_id,
            created_at: p.created_at,
            updated_at: p.updated_at,
        }
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateProjectRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateProjectRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct ProjectMemberResponse {
    pub user_id: Uuid,
    pub username: String,
    pub display_name: Option<String>,
    pub added_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct AddMemberRequest {
    pub username: String,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct ProjectListResponse {
    pub items: Vec<ProjectResponse>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct ProjectMemberListResponse {
    pub items: Vec<ProjectMemberResponse>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct SessionListResponse {
    pub items: Vec<crate::model::SessionResponse>,
}
```

- [ ] **Step 3: Update `src/model/mod.rs`**

```rust
mod auth;     // remove this if it doesn't exist — auth is a separate top-level module
mod project;
mod session;
mod user;

pub use project::*;
pub use session::*;
pub use user::*;
```

Note: if `mod auth;` was never there, don't add it. Just add `mod project;` and `pub use project::*;`.

- [ ] **Step 4: cargo check**

```bash
cargo check 2>&1 | head -40
```

Expected: still errors in sqlite.rs and session handler. Next tasks fix those.

---

## Task 3: Repository — Updated Session Methods

**Files:**
- Modify: `src/repository/sqlite.rs`

This task fixes the broken `create_session` / `get_session` methods and adds new ones.

- [ ] **Step 1: Update existing session methods in `src/repository/sqlite.rs`**

Replace the `create_session` method:

```rust
pub async fn create_session(
    &self,
    project_id: Uuid,
    creator_id: Uuid,
) -> RepositoryResult<DbSession> {
    let id = Uuid::new_v4();
    let now = Self::now_string();
    sqlx::query(
        "INSERT INTO sessions (id, project_id, creator_id, share_mode, created_at, updated_at) \
         VALUES (?, ?, ?, 'private', ?, ?);",
    )
    .bind(id.to_string())
    .bind(project_id.to_string())
    .bind(creator_id.to_string())
    .bind(&now)
    .bind(&now)
    .execute(&self.pool)
    .await?;

    Ok(DbSession {
        id,
        project_id,
        creator_id,
        share_mode: crate::repository::ShareMode::Private,
        created_at: Self::parse_timestamp(now.clone(), "sessions.created_at")?,
        updated_at: Self::parse_timestamp(now, "sessions.updated_at")?,
    })
}
```

Replace `get_session`:

```rust
pub async fn get_session(&self, id: Uuid) -> RepositoryResult<Option<DbSession>> {
    let row = sqlx::query(
        "SELECT id, project_id, creator_id, share_mode, created_at, updated_at \
         FROM sessions WHERE id = ?;",
    )
    .bind(id.to_string())
    .fetch_optional(&self.pool)
    .await?;

    let Some(row) = row else { return Ok(None) };
    Ok(Some(self.row_to_db_session(row)?))
}
```

Add helper `row_to_db_session` (private):

```rust
fn row_to_db_session(&self, row: sqlx::sqlite::SqliteRow) -> RepositoryResult<DbSession> {
    use sqlx::Row;
    let share_mode_str: String = row.get("share_mode");
    let share_mode = crate::repository::ShareMode::from_str(&share_mode_str)
        .ok_or_else(|| crate::repository::RepositoryError::InvalidData(
            format!("invalid share_mode: {share_mode_str}"),
        ))?;
    Ok(DbSession {
        id: Self::parse_uuid(row.get::<String, _>("id"), "sessions.id")?,
        project_id: Self::parse_uuid(row.get::<String, _>("project_id"), "sessions.project_id")?,
        creator_id: Self::parse_uuid(row.get::<String, _>("creator_id"), "sessions.creator_id")?,
        share_mode,
        created_at: Self::parse_timestamp(row.get::<String, _>("created_at"), "sessions.created_at")?,
        updated_at: Self::parse_timestamp(row.get::<String, _>("updated_at"), "sessions.updated_at")?,
    })
}
```

- [ ] **Step 2: Add new session repository methods**

```rust
/// Returns (DbSession, SessionAccess) for the requesting user, or None if no access.
/// Returns None for non-existent sessions.
/// Private sessions of other users return None (403 semantics handled by caller).
pub async fn get_session_with_authz(
    &self,
    session_id: Uuid,
    requesting_user_id: Uuid,
) -> RepositoryResult<Option<(DbSession, crate::repository::SessionAccess)>> {
    use sqlx::Row;
    let uid = requesting_user_id.to_string();
    let sid = session_id.to_string();

    let row = sqlx::query(
        "SELECT s.id, s.project_id, s.creator_id, s.share_mode, s.created_at, s.updated_at,
                CASE
                    WHEN s.creator_id = ?1 THEN 'creator'
                    WHEN (p.owner_id = ?1 OR pm.user_id IS NOT NULL)
                         AND s.share_mode = 'shared_chat' THEN 'chat_member'
                    WHEN (p.owner_id = ?1 OR pm.user_id IS NOT NULL)
                         AND s.share_mode = 'shared_readonly' THEN 'readonly_member'
                    ELSE NULL
                END AS access_level
         FROM sessions s
         JOIN projects p ON p.id = s.project_id
         LEFT JOIN project_members pm
               ON pm.project_id = s.project_id AND pm.user_id = ?1
         WHERE s.id = ?2",
    )
    .bind(&uid)
    .bind(&sid)
    .fetch_optional(&self.pool)
    .await?;

    let Some(row) = row else { return Ok(None) };

    let access_level: Option<String> = row.get("access_level");
    let access = match access_level.as_deref() {
        Some("creator") => crate::repository::SessionAccess::Creator,
        Some("chat_member") => crate::repository::SessionAccess::ChatMember,
        Some("readonly_member") => crate::repository::SessionAccess::ReadOnlyMember,
        _ => return Ok(None), // no access
    };

    Ok(Some((self.row_to_db_session(row)?, access)))
}

pub async fn list_sessions_in_project(
    &self,
    project_id: Uuid,
    requesting_user_id: Uuid,
) -> RepositoryResult<Vec<DbSession>> {
    use sqlx::Row;
    let pid = project_id.to_string();
    let uid = requesting_user_id.to_string();

    let rows = sqlx::query(
        "SELECT s.id, s.project_id, s.creator_id, s.share_mode, s.created_at, s.updated_at
         FROM sessions s
         JOIN projects p ON p.id = s.project_id
         WHERE s.project_id = ?1
           AND (
               s.creator_id = ?2
               OR (
                   s.share_mode != 'private'
                   AND (
                       p.owner_id = ?2
                       OR EXISTS (SELECT 1 FROM project_members pm
                                  WHERE pm.project_id = ?1 AND pm.user_id = ?2)
                   )
               )
           )
         ORDER BY s.created_at DESC",
    )
    .bind(&pid)
    .bind(&uid)
    .fetch_all(&self.pool)
    .await?;

    rows.into_iter()
        .map(|r| self.row_to_db_session(r))
        .collect()
}

pub async fn update_session_share_mode(
    &self,
    session_id: Uuid,
    share_mode: &crate::repository::ShareMode,
) -> RepositoryResult<DbSession> {
    let now = Self::now_string();
    let result = sqlx::query(
        "UPDATE sessions SET share_mode = ?, updated_at = ? WHERE id = ?",
    )
    .bind(share_mode.as_str())
    .bind(&now)
    .bind(session_id.to_string())
    .execute(&self.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(crate::repository::RepositoryError::InvalidData(
            format!("session {session_id} not found"),
        ));
    }

    self.get_session(session_id).await?.ok_or_else(|| {
        crate::repository::RepositoryError::InvalidData("session disappeared after update".into())
    })
}
```

- [ ] **Step 3: cargo check**

```bash
cargo check 2>&1 | head -60
```

Expected: errors in `handlers/session.rs` (handler still uses old `create_session(id)` signature). Fixed in Task 5.

---

## Task 4: Repository — Project + Member Methods

**Files:**
- Modify: `src/repository/sqlite.rs`

- [ ] **Step 1: Add project CRUD methods**

```rust
// ── Projects ──────────────────────────────────────────────────────────────────

fn row_to_db_project(row: &sqlx::sqlite::SqliteRow) -> RepositoryResult<DbProject> {
    use sqlx::Row;
    Ok(DbProject {
        id: Self::parse_uuid(row.get::<String, _>("id"), "projects.id")?,
        name: row.get("name"),
        description: row.get("description"),
        owner_id: Self::parse_uuid(row.get::<String, _>("owner_id"), "projects.owner_id")?,
        created_at: Self::parse_timestamp(row.get::<String, _>("created_at"), "projects.created_at")?,
        updated_at: Self::parse_timestamp(row.get::<String, _>("updated_at"), "projects.updated_at")?,
    })
}

pub async fn create_project(
    &self,
    name: String,
    description: Option<String>,
    owner_id: Uuid,
) -> RepositoryResult<DbProject> {
    let id = Uuid::new_v4();
    let now = Self::now_string();
    sqlx::query(
        "INSERT INTO projects (id, name, description, owner_id, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id.to_string())
    .bind(&name)
    .bind(&description)
    .bind(owner_id.to_string())
    .bind(&now)
    .bind(&now)
    .execute(&self.pool)
    .await?;

    Ok(DbProject {
        id,
        name,
        description,
        owner_id,
        created_at: Self::parse_timestamp(now.clone(), "projects.created_at")?,
        updated_at: Self::parse_timestamp(now, "projects.updated_at")?,
    })
}

pub async fn get_project(&self, id: Uuid) -> RepositoryResult<Option<DbProject>> {
    use sqlx::Row;
    let row = sqlx::query(
        "SELECT id, name, description, owner_id, created_at, updated_at \
         FROM projects WHERE id = ?",
    )
    .bind(id.to_string())
    .fetch_optional(&self.pool)
    .await?;
    row.map(|r| Self::row_to_db_project(&r)).transpose()
}

pub async fn list_projects_for_user(&self, user_id: Uuid) -> RepositoryResult<Vec<DbProject>> {
    use sqlx::Row;
    let uid = user_id.to_string();
    let rows = sqlx::query(
        "SELECT DISTINCT p.id, p.name, p.description, p.owner_id, p.created_at, p.updated_at
         FROM projects p
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?1
         WHERE p.owner_id = ?1 OR pm.user_id IS NOT NULL
         ORDER BY p.created_at ASC",
    )
    .bind(&uid)
    .fetch_all(&self.pool)
    .await?;
    rows.iter().map(Self::row_to_db_project).collect()
}

pub async fn update_project(
    &self,
    id: Uuid,
    name: Option<String>,
    description: Option<Option<String>>,
) -> RepositoryResult<DbProject> {
    let now = Self::now_string();
    // Build dynamic SET clause only for fields provided
    let current = self.get_project(id).await?
        .ok_or_else(|| RepositoryError::InvalidData(format!("project {id} not found")))?;

    let new_name = name.unwrap_or(current.name);
    let new_desc = description.unwrap_or(current.description);

    sqlx::query(
        "UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&new_name)
    .bind(&new_desc)
    .bind(&now)
    .bind(id.to_string())
    .execute(&self.pool)
    .await?;

    self.get_project(id).await?.ok_or_else(|| {
        RepositoryError::InvalidData("project disappeared after update".into())
    })
}

pub async fn delete_project(&self, id: Uuid) -> RepositoryResult<bool> {
    let result = sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(id.to_string())
        .execute(&self.pool)
        .await?;
    Ok(result.rows_affected() > 0)
}
```

- [ ] **Step 2: Add member management methods**

```rust
// ── Project Members ───────────────────────────────────────────────────────────

pub async fn add_project_member(
    &self,
    project_id: Uuid,
    user_id: Uuid,
) -> RepositoryResult<()> {
    let now = Self::now_string();
    sqlx::query(
        "INSERT INTO project_members (project_id, user_id, added_at) VALUES (?, ?, ?)",
    )
    .bind(project_id.to_string())
    .bind(user_id.to_string())
    .bind(&now)
    .execute(&self.pool)
    .await
    .map_err(|e| Self::map_db_error(e, "project_members.user_id"))?;
    Ok(())
}

pub async fn remove_project_member(
    &self,
    project_id: Uuid,
    user_id: Uuid,
) -> RepositoryResult<bool> {
    let result = sqlx::query(
        "DELETE FROM project_members WHERE project_id = ? AND user_id = ?",
    )
    .bind(project_id.to_string())
    .bind(user_id.to_string())
    .execute(&self.pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn list_project_members(
    &self,
    project_id: Uuid,
) -> RepositoryResult<Vec<(DbUser, chrono::DateTime<chrono::Utc>)>> {
    use sqlx::Row;
    let rows = sqlx::query(
        "SELECT u.id, u.username, u.password_hash, u.role, u.display_name, u.is_active,
                u.created_at, u.updated_at, pm.added_at
         FROM project_members pm
         JOIN users u ON u.id = pm.user_id
         WHERE pm.project_id = ?
         ORDER BY pm.added_at ASC",
    )
    .bind(project_id.to_string())
    .fetch_all(&self.pool)
    .await?;

    rows.into_iter()
        .map(|r| {
            let added_at = Self::parse_timestamp(r.get::<String, _>("added_at"), "pm.added_at")?;
            let user = self.row_to_db_user(&r)?;
            Ok((user, added_at))
        })
        .collect()
}

pub async fn user_in_project(
    &self,
    user_id: Uuid,
    project_id: Uuid,
) -> RepositoryResult<bool> {
    let row = sqlx::query(
        "SELECT 1 FROM projects WHERE id = ? AND owner_id = ?
         UNION ALL
         SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?
         LIMIT 1",
    )
    .bind(project_id.to_string())
    .bind(user_id.to_string())
    .bind(project_id.to_string())
    .bind(user_id.to_string())
    .fetch_optional(&self.pool)
    .await?;
    Ok(row.is_some())
}

pub async fn user_is_project_owner(
    &self,
    user_id: Uuid,
    project_id: Uuid,
) -> RepositoryResult<bool> {
    let row = sqlx::query("SELECT 1 FROM projects WHERE id = ? AND owner_id = ?")
        .bind(project_id.to_string())
        .bind(user_id.to_string())
        .fetch_optional(&self.pool)
        .await?;
    Ok(row.is_some())
}
```

- [ ] **Step 3: Add `create_user_with_personal_project` helper**

```rust
/// Creates a user and their 'Personal' project in sequence.
/// If project creation fails, the user still exists (best-effort; dev-stage OK).
pub async fn create_user_with_personal_project(
    &self,
    new_user: NewUser,
) -> RepositoryResult<(DbUser, DbProject)> {
    let user = self.create_user(new_user).await?;
    let project = self.create_project("Personal".to_string(), None, user.id).await?;
    Ok((user, project))
}
```

Note: `create_user` is already defined in `sqlite.rs`. This calls it, then creates the project.

- [ ] **Step 4: Verify `row_to_db_user` is accessible**

Check that `row_to_db_user` is either `pub(self)` or `fn` (not `pub`) in sqlite.rs. The `list_project_members` method calls `self.row_to_db_user(&r)`. Look at its current definition — it was referenced at `sqlite.rs:164`. If it's private, the `list_project_members` method (being in the same `impl` block) can call it.

- [ ] **Step 5: cargo check**

```bash
cargo check 2>&1 | head -60
```

Expected: errors only in handlers. Repository layer should compile.

---

## Task 5: Session Handlers Rewrite

**Files:**
- Modify: `src/handlers/session.rs`

The entire file is rewritten. The old `POST /sessions` handler is removed. New handlers have auth + try_lock.

- [ ] **Step 1: Replace `src/handlers/session.rs`**

```rust
use std::{convert::Infallible, sync::Arc};

use aide::NoApi;
use ailoy::{
    agent::{Agent, AgentBuilder, AgentCard},
    message::{Message, MessageOutput, Part, Role},
    runenv::{Sandbox, SandboxConfig},
};
use axum::{
    Json,
    extract::{Extension, Path, State},
    http::StatusCode,
    response::sse::{Event, KeepAlive, Sse},
};
use speedwagon::SpeedwagonSpec;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiResult, AppError},
    model::{CreateSessionRequest, SendMessageRequest, SendMessageResponse,
            SessionListResponse, SessionResponse, UpdateSessionRequest},
    repository::{DbSession, SessionAccess},
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

// Session exists and is verified by caller (via get_session_with_authz).
async fn resolve_agent_for(
    state: &Arc<AppState>,
    session: &DbSession,
) -> ApiResult<Arc<tokio::sync::Mutex<Agent>>> {
    let id = session.id;
    if let Some(arc) = state.get_agent(&id) {
        return Ok(arc);
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

// ── Session CRUD ──────────────────────────────────────────────────────────────

/// POST /projects/{project_id}/sessions
pub async fn create_session(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(_payload): Json<CreateSessionRequest>,
) -> ApiResult<(StatusCode, Json<SessionResponse>)> {
    let is_member = state
        .repository
        .user_in_project(auth_user.id, project_id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    if !is_member {
        return Err(AppError::forbidden("not a member of this project"));
    }

    let session = state
        .repository
        .create_session(project_id, auth_user.id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let sandbox_name = sandbox_name_for(&session.id);
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
    state.insert_agent(session.id, agent);

    tracing::info!(id = %session.id, sandbox = %sandbox_name, "session created");

    let resp = SessionResponse::from(session);
    Ok((StatusCode::CREATED, Json(resp)))
}

/// GET /projects/{project_id}/sessions
pub async fn list_sessions(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Json<SessionListResponse>> {
    let is_member = state
        .repository
        .user_in_project(auth_user.id, project_id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    if !is_member {
        return Err(AppError::forbidden("not a member of this project"));
    }

    let sessions = state
        .repository
        .list_sessions_in_project(project_id, auth_user.id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(Json(SessionListResponse {
        items: sessions.into_iter().map(SessionResponse::from).collect(),
    }))
}

/// GET /sessions/{session_id}
pub async fn get_session(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(session_id): Path<Uuid>,
) -> ApiResult<Json<SessionResponse>> {
    let (session, _access) = state
        .repository
        .get_session_with_authz(session_id, auth_user.id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("session not found or access denied"))?;

    Ok(Json(SessionResponse::from(session)))
}

/// PATCH /sessions/{session_id} — share_mode change (creator only)
pub async fn update_session(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(session_id): Path<Uuid>,
    Json(payload): Json<UpdateSessionRequest>,
) -> ApiResult<Json<SessionResponse>> {
    let (session, access) = state
        .repository
        .get_session_with_authz(session_id, auth_user.id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("session not found or access denied"))?;

    if !matches!(access, SessionAccess::Creator) {
        return Err(AppError::forbidden("only the session creator can change sharing"));
    }

    let updated = state
        .repository
        .update_session_share_mode(session.id, &payload.share_mode)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(Json(SessionResponse::from(updated)))
}

/// DELETE /sessions/{session_id} — creator only
pub async fn delete_session(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(session_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let (session, access) = state
        .repository
        .get_session_with_authz(session_id, auth_user.id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("session not found or access denied"))?;

    if !matches!(access, SessionAccess::Creator) {
        return Err(AppError::forbidden("only the session creator can delete this session"));
    }

    state
        .repository
        .delete_session(session.id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let agent_arc = state.remove_agent(&session_id);
    if let Some(arc) = agent_arc {
        drop(arc);
    }

    let sandbox_name = sandbox_name_for(&session_id);
    if let Err(e) = ailoy::runenv::remove_persisted(&sandbox_name).await {
        tracing::warn!(%session_id, "failed to remove persisted sandbox: {e}");
    }

    tracing::info!(%session_id, "session deleted");
    Ok(StatusCode::NO_CONTENT)
}

// ── Messages ──────────────────────────────────────────────────────────────────

/// GET /sessions/{session_id}/messages
pub async fn get_message_history(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(session_id): Path<Uuid>,
) -> ApiResult<Json<Vec<Message>>> {
    let _ = state
        .repository
        .get_session_with_authz(session_id, auth_user.id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("session not found or access denied"))?;

    let messages = state
        .repository
        .get_messages(session_id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(Json(messages))
}

/// DELETE /sessions/{session_id}/messages — creator only
pub async fn clear_message_history(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(session_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let (session, access) = state
        .repository
        .get_session_with_authz(session_id, auth_user.id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("session not found or access denied"))?;

    if !matches!(access, SessionAccess::Creator) {
        return Err(AppError::forbidden("only the session creator can clear history"));
    }

    state
        .repository
        .clear_messages(session.id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    if let Some(arc) = state.get_agent(&session_id) {
        arc.lock().await.state.history.clear();
    }

    tracing::info!(%session_id, "message history cleared");
    Ok(StatusCode::NO_CONTENT)
}

/// POST /sessions/{session_id}/messages
pub async fn send_message(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(session_id): Path<Uuid>,
    Json(payload): Json<SendMessageRequest>,
) -> ApiResult<Json<SendMessageResponse>> {
    let (session, access) = state
        .repository
        .get_session_with_authz(session_id, auth_user.id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("session not found or access denied"))?;

    if matches!(access, SessionAccess::ReadOnlyMember) {
        return Err(AppError::forbidden("read-only access to this session"));
    }

    let agent_arc = resolve_agent_for(&state, &session).await?;

    let mut agent = agent_arc
        .try_lock()
        .map_err(|_| AppError::locked("session is currently in use"))?;

    let prev_len = agent.get_history().len();
    let msg = Message::new(Role::User).with_contents([Part::text(payload.content)]);
    let mut run = agent.run(msg);
    let mut outputs: Vec<MessageOutput> = Vec::new();
    while let Some(item) = futures_util::StreamExt::next(&mut run).await {
        outputs.push(item.map_err(|e| AppError::internal(e.to_string()))?);
    }
    drop(run);
    let new_messages = agent.get_history()[prev_len..].to_vec();
    drop(agent);

    state
        .repository
        .append_messages(session_id, &new_messages)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(Json(outputs))
}

/// POST /sessions/{session_id}/messages/stream
pub async fn send_message_stream(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(session_id): Path<Uuid>,
    Json(payload): Json<SendMessageRequest>,
) -> ApiResult<
    NoApi<Sse<impl futures_util::Stream<Item = Result<Event, Infallible>> + Send + 'static>>,
> {
    let (session, access) = state
        .repository
        .get_session_with_authz(session_id, auth_user.id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("session not found or access denied"))?;

    if matches!(access, SessionAccess::ReadOnlyMember) {
        return Err(AppError::forbidden("read-only access to this session"));
    }

    let agent_arc = resolve_agent_for(&state, &session).await?;

    // Acquire OwnedMutexGuard (no lifetime) — held for the entire SSE stream.
    // Returns 423 immediately if another request holds the lock.
    let guard = agent_arc
        .clone()
        .try_lock_owned()
        .map_err(|_| AppError::locked("session is currently in use"))?;

    let prev_len = guard.get_history().len();
    let repo = state.repository.clone();
    let content = payload.content;

    let stream = async_stream::stream! {
        let mut agent = guard;  // OwnedMutexGuard moved in — lock held for stream lifetime
        let msg = Message::new(Role::User).with_contents([Part::text(content)]);
        let mut run = agent.run(msg);

        while let Some(item) = futures_util::StreamExt::next(&mut run).await {
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
        drop(agent);  // Release OwnedMutexGuard (lock released here)

        if let Err(e) = repo.append_messages(session_id, &new_msgs).await {
            tracing::error!(%session_id, "failed to persist messages: {e}");
        }

        yield Ok(Event::default().event("done").data("[DONE]"));
    };

    Ok(NoApi(Sse::new(stream).keep_alive(KeepAlive::default())))
}
```

- [ ] **Step 2: cargo check**

```bash
cargo check 2>&1 | head -40
```

Expected: errors about missing handlers in `mod.rs` and router (project handlers not created yet). Session handler errors should be gone.

---

## Task 6: Project Handlers

**Files:**
- Create: `src/handlers/project.rs`
- Modify: `src/handlers/mod.rs`

- [ ] **Step 1: Create `src/handlers/project.rs`**

```rust
use std::sync::Arc;

use axum::{
    Json,
    extract::{Extension, Path, State},
    http::StatusCode,
};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiResult, AppError},
    model::{
        AddMemberRequest, CreateProjectRequest, ProjectListResponse, ProjectMemberListResponse,
        ProjectMemberResponse, ProjectResponse, UpdateProjectRequest,
    },
    repository::RepositoryError,
    state::AppState,
};

/// POST /projects
pub async fn create_project(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(payload): Json<CreateProjectRequest>,
) -> ApiResult<(StatusCode, Json<ProjectResponse>)> {
    let project = state
        .repository
        .create_project(payload.name, payload.description, auth_user.id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    tracing::info!(id = %project.id, owner = %auth_user.id, "project created");
    Ok((StatusCode::CREATED, Json(ProjectResponse::from(project))))
}

/// GET /projects
pub async fn list_projects(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
) -> ApiResult<Json<ProjectListResponse>> {
    let projects = state
        .repository
        .list_projects_for_user(auth_user.id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(Json(ProjectListResponse {
        items: projects.into_iter().map(ProjectResponse::from).collect(),
    }))
}

/// GET /projects/{project_id}
pub async fn get_project(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Json<ProjectResponse>> {
    let project = state
        .repository
        .get_project(project_id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("project not found"))?;

    let is_member = state
        .repository
        .user_in_project(auth_user.id, project_id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    if !is_member {
        return Err(AppError::forbidden("not a member of this project"));
    }

    Ok(Json(ProjectResponse::from(project)))
}

/// PATCH /projects/{project_id} — owner only
pub async fn update_project(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<UpdateProjectRequest>,
) -> ApiResult<Json<ProjectResponse>> {
    require_owner(&state, auth_user.id, project_id).await?;

    let updated = state
        .repository
        .update_project(project_id, payload.name, payload.description.map(Some))
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(Json(ProjectResponse::from(updated)))
}

/// DELETE /projects/{project_id} — owner only (cascades sessions)
pub async fn delete_project(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    require_owner(&state, auth_user.id, project_id).await?;

    state
        .repository
        .delete_project(project_id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    tracing::info!(id = %project_id, "project deleted");
    Ok(StatusCode::NO_CONTENT)
}

/// GET /projects/{project_id}/members
pub async fn list_members(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
) -> ApiResult<Json<ProjectMemberListResponse>> {
    require_member(&state, auth_user.id, project_id).await?;

    let members = state
        .repository
        .list_project_members(project_id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let items = members
        .into_iter()
        .map(|(u, added_at)| ProjectMemberResponse {
            user_id: u.id,
            username: u.username,
            display_name: u.display_name,
            added_at,
        })
        .collect();

    Ok(Json(ProjectMemberListResponse { items }))
}

/// POST /projects/{project_id}/members — owner only, body: { username }
pub async fn add_member(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<AddMemberRequest>,
) -> ApiResult<StatusCode> {
    require_owner(&state, auth_user.id, project_id).await?;

    let target = state
        .repository
        .get_user_by_username(&payload.username)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("user not found"))?;

    state
        .repository
        .add_project_member(project_id, target.id)
        .await
        .map_err(|e| match e {
            RepositoryError::UniqueViolation(_) => AppError::conflict("user is already a member"),
            other => AppError::internal(other.to_string()),
        })?;

    tracing::info!(project = %project_id, user = %target.id, "member added");
    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /projects/{project_id}/members/{user_id}
/// Owner can remove anyone. Member can only remove themselves (leave).
pub async fn remove_member(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path((project_id, target_user_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<StatusCode> {
    let is_owner = state
        .repository
        .user_is_project_owner(auth_user.id, project_id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    if !is_owner {
        // Non-owner may only remove themselves
        if auth_user.id != target_user_id {
            return Err(AppError::forbidden("only the project owner can remove other members"));
        }
        // Prevent owner leaving via this path (shouldn't happen since owner is not in members table,
        // but guard anyway)
        let is_target_owner = state
            .repository
            .user_is_project_owner(target_user_id, project_id)
            .await
            .map_err(|e| AppError::internal(e.to_string()))?;
        if is_target_owner {
            return Err(AppError::bad_request("owner cannot leave; transfer ownership first"));
        }
    } else if auth_user.id == target_user_id {
        // Owner trying to remove themselves
        return Err(AppError::bad_request("owner cannot leave; transfer ownership first"));
    }

    // Confirm requester has membership (non-owner must be a member to self-leave)
    if !is_owner {
        let is_member = state
            .repository
            .user_in_project(auth_user.id, project_id)
            .await
            .map_err(|e| AppError::internal(e.to_string()))?;
        if !is_member {
            return Err(AppError::forbidden("not a member of this project"));
        }
    }

    let removed = state
        .repository
        .remove_project_member(project_id, target_user_id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    if !removed {
        return Err(AppError::not_found("member not found"));
    }

    tracing::info!(project = %project_id, user = %target_user_id, "member removed");
    Ok(StatusCode::NO_CONTENT)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async fn require_member(state: &Arc<AppState>, user_id: Uuid, project_id: Uuid) -> ApiResult<()> {
    let exists = state
        .repository
        .get_project(project_id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .is_some();
    if !exists {
        return Err(AppError::not_found("project not found"));
    }
    let is_member = state
        .repository
        .user_in_project(user_id, project_id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    if !is_member {
        Err(AppError::forbidden("not a member of this project"))
    } else {
        Ok(())
    }
}

async fn require_owner(state: &Arc<AppState>, user_id: Uuid, project_id: Uuid) -> ApiResult<()> {
    let exists = state
        .repository
        .get_project(project_id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .is_some();
    if !exists {
        return Err(AppError::not_found("project not found"));
    }
    let is_owner = state
        .repository
        .user_is_project_owner(user_id, project_id)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    if !is_owner {
        Err(AppError::forbidden("owner access required"))
    } else {
        Ok(())
    }
}
```

- [ ] **Step 2: Update `src/handlers/mod.rs`**

```rust
mod auth;
mod project;
mod session;
mod user;

pub use auth::*;
pub use project::*;
pub use session::*;
pub use user::*;
```

- [ ] **Step 3: cargo check**

```bash
cargo check 2>&1 | head -40
```

---

## Task 7: Router Update

**Files:**
- Modify: `src/router.rs`

- [ ] **Step 1: Replace `src/router.rs`**

```rust
use std::sync::Arc;

use aide::axum::{
    ApiRouter,
    routing::{delete, get, patch, post},
};

use crate::{
    auth::{admin_required, auth_required},
    handlers,
    state::AppState,
};

pub fn get_router(state: Arc<AppState>) -> ApiRouter {
    let auth_routes = ApiRouter::new()
        .api_route("/auth/signup", post(handlers::signup))
        .api_route("/auth/login", post(handlers::login));

    let me_routes = ApiRouter::new()
        .api_route("/me", get(handlers::get_me).patch(handlers::update_me))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth_required,
        ));

    let admin_routes = ApiRouter::new()
        .api_route(
            "/admin/users",
            get(handlers::list_users).post(handlers::create_user_admin),
        )
        .api_route(
            "/admin/users/{id}",
            get(handlers::get_user_admin)
                .patch(handlers::update_user_admin)
                .delete(handlers::delete_user_admin),
        )
        .layer(axum::middleware::from_fn(admin_required))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth_required,
        ));

    let project_routes = ApiRouter::new()
        .api_route("/projects", get(handlers::list_projects).post(handlers::create_project))
        .api_route(
            "/projects/{project_id}",
            get(handlers::get_project)
                .patch(handlers::update_project)
                .delete(handlers::delete_project),
        )
        .api_route(
            "/projects/{project_id}/members",
            get(handlers::list_members).post(handlers::add_member),
        )
        .api_route(
            "/projects/{project_id}/members/{user_id}",
            delete(handlers::remove_member),
        )
        .api_route(
            "/projects/{project_id}/sessions",
            get(handlers::list_sessions).post(handlers::create_session),
        )
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth_required,
        ));

    let session_routes = ApiRouter::new()
        .api_route(
            "/sessions/{session_id}",
            get(handlers::get_session)
                .patch(handlers::update_session)
                .delete(handlers::delete_session),
        )
        .api_route(
            "/sessions/{session_id}/messages",
            get(handlers::get_message_history)
                .post(handlers::send_message)
                .delete(handlers::clear_message_history),
        )
        .api_route(
            "/sessions/{session_id}/messages/stream",
            post(handlers::send_message_stream),
        )
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth_required,
        ));

    ApiRouter::new()
        .merge(auth_routes)
        .merge(me_routes)
        .merge(admin_routes)
        .merge(project_routes)
        .merge(session_routes)
        .with_state(state)
}
```

- [ ] **Step 2: cargo build (full compile)**

```bash
cargo build 2>&1 | head -60
```

Expected: should compile cleanly (or near-cleanly). Fix any remaining type errors before continuing.

---

## Task 8: Signup + Bootstrap Personal Project

**Files:**
- Modify: `src/handlers/auth.rs`
- Modify: `src/auth/bootstrap.rs`

- [ ] **Step 1: Update signup handler in `src/handlers/auth.rs`**

Replace `create_user(NewUser {...})` call with `create_user_with_personal_project`:

```rust
pub async fn signup(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SignupRequest>,
) -> ApiResult<(StatusCode, Json<UserResponse>)> {
    validate_password(&payload.password)?;

    let password_hash = hash_password(&payload.password)?;
    let id = Uuid::new_v4();

    let (user, _personal_project) = state
        .repository
        .create_user_with_personal_project(NewUser {
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
```

- [ ] **Step 2: Update bootstrap in `src/auth/bootstrap.rs`**

Replace the `create_user(...)` call with `create_user_with_personal_project`:

```rust
match repo
    .create_user_with_personal_project(NewUser {
        id: Uuid::new_v4(),
        username: u.clone(),
        password_hash,
        role: Role::Admin,
        display_name: None,
        is_active: true,
    })
    .await
{
    Ok((user, project)) => {
        tracing::info!(
            id = %user.id, username = %u, project_id = %project.id,
            "bootstrap admin user created from env"
        );
    }
    Err(e) => {
        tracing::error!("failed to create bootstrap admin: {e}");
    }
}
```

- [ ] **Step 3: cargo build**

```bash
cargo build 2>&1
```

Expected: clean build. Fix any warnings/errors.

---

## Task 9: Update Test Helpers + Fix Existing Tests

**Files:**
- Modify: `tests/common/mod.rs`
- Modify: `tests/auth_test.rs`
- Modify: `tests/message_history_persistence.rs`
- Modify: `tests/sandbox_per_session.rs`
- Modify: `tests/e2e_test.rs`

- [ ] **Step 1: Add new helpers to `tests/common/mod.rs`**

Add after the existing auth helpers:

```rust
// ── Project helpers ───────────────────────────────────────────────────────────

pub async fn create_project(
    app: &axum::Router,
    token: &str,
    name: &str,
) -> serde_json::Value {
    let (status, body) = authed(
        app,
        "POST",
        "/projects",
        token,
        Some(serde_json::json!({ "name": name })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::CREATED, "create_project failed: {body}");
    body
}

pub async fn get_personal_project(app: &axum::Router, token: &str) -> serde_json::Value {
    let (status, body) = authed(app, "GET", "/projects", token, None).await;
    assert_eq!(status, axum::http::StatusCode::OK, "list_projects failed: {body}");
    body["items"]
        .as_array()
        .expect("items array")
        .iter()
        .find(|p| p["name"] == "Personal")
        .cloned()
        .expect("Personal project not found")
}

pub async fn add_member(
    app: &axum::Router,
    owner_token: &str,
    project_id: &str,
    username: &str,
) {
    let (status, body) = authed(
        app,
        "POST",
        &format!("/projects/{project_id}/members"),
        owner_token,
        Some(serde_json::json!({ "username": username })),
    )
    .await;
    assert_eq!(
        status,
        axum::http::StatusCode::NO_CONTENT,
        "add_member failed: {body}"
    );
}

/// Create an authenticated session in the given project.
pub async fn post_session_authed(
    app: &axum::Router,
    token: &str,
    project_id: &str,
) -> uuid::Uuid {
    let (status, body) = authed(
        app,
        "POST",
        &format!("/projects/{project_id}/sessions"),
        token,
        Some(serde_json::json!({})),
    )
    .await;
    assert_eq!(
        status,
        axum::http::StatusCode::CREATED,
        "post_session_authed failed: {body}"
    );
    uuid::Uuid::parse_str(body["id"].as_str().unwrap()).unwrap()
}

pub async fn update_share_mode(
    app: &axum::Router,
    token: &str,
    session_id: uuid::Uuid,
    mode: &str,
) {
    let (status, body) = authed(
        app,
        "PATCH",
        &format!("/sessions/{session_id}"),
        token,
        Some(serde_json::json!({ "share_mode": mode })),
    )
    .await;
    assert_eq!(
        status,
        axum::http::StatusCode::OK,
        "update_share_mode failed: {body}"
    );
}
```

Update the old `post_session` to create a real user/project first (or deprecate it). Replace `post_session` body:

```rust
/// Deprecated: prefer post_session_authed. Creates a user, signs up, gets personal project.
pub async fn post_session(app: &axum::Router) -> uuid::Uuid {
    // Create a throwaway user and return a session in their personal project
    let username = format!("testuser_{}", uuid::Uuid::new_v4().simple());
    signup(app, &username, "Password123!").await;
    let token = login(app, &username, "Password123!").await;
    let project = get_personal_project(app, &token).await;
    let project_id = project["id"].as_str().unwrap();
    post_session_authed(app, &token, project_id).await
}
```

- [ ] **Step 2: Fix `tests/auth_test.rs`**

After every `signup` call, add a check that a Personal project exists:

Find the test that verifies signup works and add:
```rust
// After signup + login
let token = login(app, "testuser", "Password123!").await;
let personal = get_personal_project(&app, &token).await;
assert_eq!(personal["name"], "Personal");
```

The existing tests that don't care about projects should still pass since `signup` works the same way.

- [ ] **Step 3: Fix remaining tests**

For `tests/message_history_persistence.rs`, `tests/sandbox_per_session.rs`, and `tests/e2e_test.rs`:

In each test that calls `post_session(app)`, replace with:
```rust
let username = format!("user_{}", uuid::Uuid::new_v4().simple());
common::signup(&app, &username, "Password123!").await;
let token = common::login(&app, &username, "Password123!").await;
let project = common::get_personal_project(&app, &token).await;
let project_id = project["id"].as_str().unwrap();
let session_id = common::post_session_authed(&app, &token, project_id).await;
```

For `send_message` and `send_message_stream` calls, wrap them with `authed(...)` or update helpers to pass token. Check each test file and update the HTTP calls to include `Authorization: Bearer {token}`.

- [ ] **Step 4: Run existing tests**

```bash
cargo test --test auth_test 2>&1 | tail -20
cargo test --test message_history_persistence 2>&1 | tail -20
cargo test --test sandbox_per_session 2>&1 | tail -20
```

Expected: tests that don't require an external AI provider should pass. Tests that need the AI provider will be skipped (that's fine).

- [ ] **Step 5: Commit**

```bash
git add migrations/ src/ tests/common/mod.rs tests/auth_test.rs \
        tests/message_history_persistence.rs tests/sandbox_per_session.rs \
        tests/e2e_test.rs
git commit -m "feat: add Project workspace and session sharing model"
```

---

## Task 10: New Tests — `tests/project_test.rs`

**Files:**
- Create: `tests/project_test.rs`

- [ ] **Step 1: Write `tests/project_test.rs`**

```rust
#[path = "common/mod.rs"]
mod common;

use axum::http::StatusCode;

#[tokio::test]
async fn signup_creates_personal_project() {
    let repo = common::make_repo().await;
    let app = common::make_app_with_repo(repo);

    common::signup(&app, "alice", "Password123!").await;
    let token = common::login(&app, "alice", "Password123!").await;

    let (status, body) = common::authed(&app, "GET", "/projects", &token, None).await;
    assert_eq!(status, StatusCode::OK);
    let items = body["items"].as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["name"], "Personal");
}

#[tokio::test]
async fn non_member_cannot_access_project() {
    let repo = common::make_repo().await;
    let app = common::make_app_with_repo(repo);

    common::signup(&app, "alice", "Password123!").await;
    let alice_token = common::login(&app, "alice", "Password123!").await;
    let project = common::get_personal_project(&app, &alice_token).await;
    let project_id = project["id"].as_str().unwrap();

    common::signup(&app, "bob", "Password123!").await;
    let bob_token = common::login(&app, "bob", "Password123!").await;

    let (status, _) = common::authed(&app, "GET", &format!("/projects/{project_id}"), &bob_token, None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn owner_can_invite_and_remove_member() {
    let repo = common::make_repo().await;
    let app = common::make_app_with_repo(repo);

    common::signup(&app, "alice", "Password123!").await;
    common::signup(&app, "bob", "Password123!").await;
    let alice_token = common::login(&app, "alice", "Password123!").await;
    let bob_token = common::login(&app, "bob", "Password123!").await;

    let project = common::get_personal_project(&app, &alice_token).await;
    let project_id = project["id"].as_str().unwrap();

    // Bob cannot access before invite
    let (status, _) = common::authed(&app, "GET", &format!("/projects/{project_id}"), &bob_token, None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Alice invites Bob
    common::add_member(&app, &alice_token, project_id, "bob").await;

    // Bob can now access
    let (status, _) = common::authed(&app, "GET", &format!("/projects/{project_id}"), &bob_token, None).await;
    assert_eq!(status, StatusCode::OK);

    // Non-owner (Bob) cannot remove another member — but can leave
    let bob_id = {
        let (_, body) = common::authed(&app, "GET", "/me", &bob_token, None).await;
        body["id"].as_str().unwrap().to_string()
    };
    let alice_id = {
        let (_, body) = common::authed(&app, "GET", "/me", &alice_token, None).await;
        body["id"].as_str().unwrap().to_string()
    };

    // Bob tries to remove Alice — should fail
    let (status, _) = common::authed(
        &app, "DELETE", &format!("/projects/{project_id}/members/{alice_id}"), &bob_token, None
    ).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Alice (owner) removes Bob
    let (status, _) = common::authed(
        &app, "DELETE", &format!("/projects/{project_id}/members/{bob_id}"), &alice_token, None
    ).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // Bob no longer has access
    let (status, _) = common::authed(&app, "GET", &format!("/projects/{project_id}"), &bob_token, None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn member_cannot_invite() {
    let repo = common::make_repo().await;
    let app = common::make_app_with_repo(repo);

    common::signup(&app, "alice", "Password123!").await;
    common::signup(&app, "bob", "Password123!").await;
    common::signup(&app, "charlie", "Password123!").await;
    let alice_token = common::login(&app, "alice", "Password123!").await;
    let bob_token = common::login(&app, "bob", "Password123!").await;

    let project = common::get_personal_project(&app, &alice_token).await;
    let project_id = project["id"].as_str().unwrap();

    common::add_member(&app, &alice_token, project_id, "bob").await;

    // Bob (member) tries to invite Charlie — should fail
    let (status, _) = common::authed(
        &app,
        "POST",
        &format!("/projects/{project_id}/members"),
        &bob_token,
        Some(serde_json::json!({ "username": "charlie" })),
    ).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn project_delete_cascades_sessions() {
    let repo = common::make_repo().await;
    let app = common::make_app_with_repo(repo);

    common::signup(&app, "alice", "Password123!").await;
    let token = common::login(&app, "alice", "Password123!").await;
    let project = common::get_personal_project(&app, &token).await;
    let project_id = project["id"].as_str().unwrap();

    let session_id = common::post_session_authed(&app, &token, project_id).await;

    // Session exists
    let (status, _) = common::authed(
        &app, "GET", &format!("/sessions/{session_id}"), &token, None
    ).await;
    assert_eq!(status, StatusCode::OK);

    // Delete project
    let (status, _) = common::authed(
        &app, "DELETE", &format!("/projects/{project_id}"), &token, None
    ).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // Session should be gone
    let (status, _) = common::authed(
        &app, "GET", &format!("/sessions/{session_id}"), &token, None
    ).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn owner_leave_is_blocked() {
    let repo = common::make_repo().await;
    let app = common::make_app_with_repo(repo);

    common::signup(&app, "alice", "Password123!").await;
    let token = common::login(&app, "alice", "Password123!").await;
    let project = common::get_personal_project(&app, &token).await;
    let project_id = project["id"].as_str().unwrap();

    let alice_id = {
        let (_, body) = common::authed(&app, "GET", "/me", &token, None).await;
        body["id"].as_str().unwrap().to_string()
    };

    let (status, _) = common::authed(
        &app, "DELETE", &format!("/projects/{project_id}/members/{alice_id}"), &token, None
    ).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}
```

- [ ] **Step 2: Run tests**

```bash
cargo test --test project_test 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/project_test.rs
git commit -m "test: add project CRUD and membership tests"
```

---

## Task 11: New Tests — `tests/session_authz_test.rs`

**Files:**
- Create: `tests/session_authz_test.rs`

- [ ] **Step 1: Write `tests/session_authz_test.rs`**

```rust
#[path = "common/mod.rs"]
mod common;

use axum::http::StatusCode;

/// Setup helper: alice owns a project, bob is a member, charlie is not.
async fn setup_project_with_members(
    app: &axum::Router,
) -> (String, String, String, String) {
    common::signup(app, "alice", "Password123!").await;
    common::signup(app, "bob", "Password123!").await;
    common::signup(app, "charlie", "Password123!").await;

    let alice_token = common::login(app, "alice", "Password123!").await;
    let bob_token = common::login(app, "bob", "Password123!").await;
    let charlie_token = common::login(app, "charlie", "Password123!").await;

    let project = common::get_personal_project(app, &alice_token).await;
    let project_id = project["id"].as_str().unwrap().to_string();

    common::add_member(app, &alice_token, &project_id, "bob").await;

    (alice_token, bob_token, charlie_token, project_id)
}

#[tokio::test]
async fn private_session_not_accessible_to_member() {
    let repo = common::make_repo().await;
    let app = common::make_app_with_repo(repo);
    let (alice_token, bob_token, _charlie_token, project_id) =
        setup_project_with_members(&app).await;

    let session_id = common::post_session_authed(&app, &alice_token, &project_id).await;
    // Default share_mode = private
    // Bob (member) should NOT see this session
    let (status, _) = common::authed(
        &app, "GET", &format!("/sessions/{session_id}"), &bob_token, None
    ).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "private session should be 404 to non-creator");
}

#[tokio::test]
async fn non_member_cannot_access_any_session() {
    let repo = common::make_repo().await;
    let app = common::make_app_with_repo(repo);
    let (alice_token, _bob_token, charlie_token, project_id) =
        setup_project_with_members(&app).await;

    let session_id = common::post_session_authed(&app, &alice_token, &project_id).await;
    common::update_share_mode(&app, &alice_token, session_id, "shared_chat").await;

    // Charlie (non-member) still gets 404 even for shared session
    let (status, _) = common::authed(
        &app, "GET", &format!("/sessions/{session_id}"), &charlie_token, None
    ).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn shared_readonly_allows_read_but_not_send() {
    let repo = common::make_repo().await;
    let app = common::make_app_with_repo(repo);
    let (alice_token, bob_token, _charlie_token, project_id) =
        setup_project_with_members(&app).await;

    let session_id = common::post_session_authed(&app, &alice_token, &project_id).await;
    common::update_share_mode(&app, &alice_token, session_id, "shared_readonly").await;

    // Bob can read messages
    let (status, _) = common::authed(
        &app, "GET", &format!("/sessions/{session_id}/messages"), &bob_token, None
    ).await;
    assert_eq!(status, StatusCode::OK);

    // Bob cannot send messages
    let (status, _) = common::authed(
        &app,
        "POST",
        &format!("/sessions/{session_id}/messages"),
        &bob_token,
        Some(serde_json::json!({ "content": "hello" })),
    ).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn only_creator_can_change_share_mode() {
    let repo = common::make_repo().await;
    let app = common::make_app_with_repo(repo);
    let (alice_token, bob_token, _charlie_token, project_id) =
        setup_project_with_members(&app).await;

    let session_id = common::post_session_authed(&app, &alice_token, &project_id).await;
    common::update_share_mode(&app, &alice_token, session_id, "shared_chat").await;

    // Bob (chat member) tries to change share_mode — should fail
    let (status, _) = common::authed(
        &app,
        "PATCH",
        &format!("/sessions/{session_id}"),
        &bob_token,
        Some(serde_json::json!({ "share_mode": "private" })),
    ).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn private_session_not_in_project_list() {
    let repo = common::make_repo().await;
    let app = common::make_app_with_repo(repo);
    let (alice_token, bob_token, _charlie_token, project_id) =
        setup_project_with_members(&app).await;

    // Alice creates a private session
    common::post_session_authed(&app, &alice_token, &project_id).await;
    // Bob creates his own private session in the same project
    let bob_project = common::get_personal_project(&app, &bob_token).await;
    // Bob creates a session in his own Personal project (not Alice's)
    // For this test, Bob is in Alice's project, so list Alice's project sessions
    let (status, body) = common::authed(
        &app, "GET", &format!("/projects/{project_id}/sessions"), &bob_token, None
    ).await;
    assert_eq!(status, StatusCode::OK);
    // Bob should see 0 sessions (Alice's is private)
    assert_eq!(body["items"].as_array().unwrap().len(), 0);

    // Now alice shares her session
    let session_id = {
        let (_, body) = common::authed(
            &app, "GET", &format!("/projects/{project_id}/sessions"), &alice_token, None
        ).await;
        body["items"][0]["id"].as_str().unwrap().to_string()
    };
    common::update_share_mode(&app, &alice_token, uuid::Uuid::parse_str(&session_id).unwrap(), "shared_readonly").await;

    // Now Bob can see it
    let (_, body) = common::authed(
        &app, "GET", &format!("/projects/{project_id}/sessions"), &bob_token, None
    ).await;
    assert_eq!(body["items"].as_array().unwrap().len(), 1);
    // Drop bob_project to avoid unused warning
    let _ = bob_project;
}

#[tokio::test]
async fn concurrent_send_returns_423() {
    use tokio::sync::Barrier;
    use std::sync::Arc;

    let repo = common::make_repo().await;
    let app = common::make_app_with_repo(repo);

    common::signup(&app, "alice", "Password123!").await;
    let token = common::login(&app, "alice", "Password123!").await;
    let project = common::get_personal_project(&app, &token).await;
    let project_id = project["id"].as_str().unwrap();
    let session_id = common::post_session_authed(&app, &token, project_id).await;

    // Simulate: one request holds the agent lock, a second comes in.
    // We do this by grabbing the agent lock from state directly, then making an HTTP call.
    // But in tests, AppState is not directly accessible from here.
    // Instead: make two concurrent POST /messages calls. The second should get 423.
    // Since we don't have a real AI model in tests, both will fail with 500 (no model),
    // but the LOCK check happens before the AI call, so if the first holds the lock
    // the second should get 423 before the first returns.

    // Note: without a real AI model, the send_message call will fail at `agent.run(msg)`.
    // The try_lock check is BEFORE the run, so concurrent calls still trigger 423.
    // This test verifies the 423 path by making two "simultaneous" requests.
    
    let app_clone = app.clone();
    let session_str = session_id.to_string();
    let token_clone = token.clone();

    // Send two requests concurrently
    let (r1, r2) = tokio::join!(
        common::authed(
            &app,
            "POST",
            &format!("/sessions/{session_id}/messages"),
            &token,
            Some(serde_json::json!({ "content": "hello from req1" })),
        ),
        common::authed(
            &app_clone,
            "POST",
            &format!("/sessions/{session_str}/messages"),
            &token_clone,
            Some(serde_json::json!({ "content": "hello from req2" })),
        ),
    );

    let statuses = [r1.0, r2.0];
    // At least one should be 423 (the one that couldn't acquire the lock)
    // or both fail for different reasons. We assert at least one is 423.
    // Note: without a real model, neither will succeed (500), but one should be 423.
    assert!(
        statuses.iter().any(|s| *s == StatusCode::LOCKED),
        "expected at least one 423 Locked, got {:?}", statuses
    );
}
```

- [ ] **Step 2: Run tests**

```bash
cargo test --test session_authz_test 2>&1 | tail -40
```

Expected: all tests except `concurrent_send_returns_423` should pass cleanly. The concurrent test may be environment-dependent — if it fails, verify the try_lock logic in handlers/session.rs.

- [ ] **Step 3: Run full test suite**

```bash
cargo test 2>&1 | tail -40
```

Expected: all tests that don't need an AI model provider pass.

- [ ] **Step 4: Final commit**

```bash
git add tests/session_authz_test.rs
git commit -m "test: add session authorization and lock tests"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Project: owner + member, owner manages | Task 6 (handlers) + Task 10 (tests) |
| Session under project | Task 1 (migration), Task 3 (repo), Task 5 (handlers) |
| Session private by default | Task 3 (`create_session` default 'private') |
| share_mode: private / shared_readonly / shared_chat | Task 1 (migration CHECK), Task 2 (model) |
| Only creator can change share_mode | Task 5 (update_session handler) + Task 11 |
| Non-member gets 403 on project | Task 6 (require_member) + Task 10 |
| Non-shared session → 404 to non-creator | Task 3 (get_session_with_authz returns None) + Task 11 |
| shared_readonly → read OK, send 403 | Task 5 (send_message ReadOnlyMember check) + Task 11 |
| shared_chat → send OK, lock 423 | Task 5 (try_lock_owned) + Task 11 |
| SSE auto-lock via OwnedMutexGuard | Task 5 (send_message_stream) |
| signup creates Personal project | Task 8 (auth.rs) + Task 10 |
| bootstrap admin creates Personal project | Task 8 (bootstrap.rs) |
| project cascade delete → sessions deleted | Task 1 (ON DELETE CASCADE) + Task 10 |
| Private session hidden in list | Task 3 (list_sessions_in_project SQL) + Task 11 |
| Owner cannot leave project | Task 6 (remove_member handler) + Task 10 |

**Placeholder scan:** None found.

**Type consistency:**
- `ShareMode` defined in `repository/mod.rs`, re-exported via `model/session.rs`'s `pub use`
- `SessionAccess` defined in `repository/mod.rs`, used in handlers/session.rs
- `DbSession.share_mode: ShareMode` ✓
- `update_session_share_mode(session_id, &ShareMode)` matches usage in handlers ✓
- `try_lock_owned()` on `Arc<tokio::sync::Mutex<Agent>>` — tokio provides this ✓
- `create_user_with_personal_project` returns `(DbUser, DbProject)` ✓
