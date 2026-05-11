# Repository Domain Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split monolithic `repository/sqlite.rs` (941 lines) into domain-scoped files and co-locate DAO types with their repository impl.

**Architecture:** Create `repository/{user,session,project}.rs`, each containing DAO types + an `impl SqliteRepository` block. The shared helpers (`parse_uuid`, `now_string`, etc.) stay in `repository/sqlite.rs` as `pub(crate)` methods. `repository/mod.rs` becomes a thin re-export hub. All existing external import paths (`crate::repository::DbUser`, etc.) remain unchanged.

**Tech Stack:** Rust, sqlx (SQLite), no new dependencies.

---

## File Map

| File | Action | Responsibility after |
|------|--------|----------------------|
| `src/repository/sqlite.rs` | Modify | `SqliteRepository` struct + 5 shared helpers + all `#[cfg(test)]` |
| `src/repository/user.rs` | Create | `DbUser`, `NewUser`, `UpdateUser` + user impl block |
| `src/repository/session.rs` | Create | `DbSession`, `SessionAccess`, `ShareMode` + session/message impl block |
| `src/repository/project.rs` | Create | `DbProject`, `DbProjectMember` + project/member impl block |
| `src/repository/mod.rs` | Modify | Error types, factory fns, `AppRepository`, re-exports only |
| `src/model/session.rs` | Modify | Add `SessionListResponse` (moved from `model/project.rs`) |
| `src/model/project.rs` | Modify | Remove `SessionListResponse` |

---

### Task 1: Widen visibility of shared helpers and `pool` field

**Files:**
- Modify: `src/repository/sqlite.rs`

These five helpers are called by every domain impl block. Making them `pub(crate)` lets sibling modules (`user.rs`, `session.rs`, `project.rs`) call `Self::parse_uuid(...)` etc. The `pool` field also needs `pub(crate)` so domain impl blocks can execute queries.

- [ ] **Step 1: Edit `repository/sqlite.rs`** — change `pool` field and all five helpers to `pub(crate)`:

Replace lines 11–52 (`SqliteRepository` struct definition + first impl block) with:

```rust
pub struct SqliteRepository {
    pub(crate) pool: SqlitePool,
}

impl SqliteRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub(crate) fn now_string() -> String {
        Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
    }

    pub(crate) fn parse_uuid(s: String, field: &str) -> RepositoryResult<Uuid> {
        Uuid::parse_str(&s)
            .map_err(|_| RepositoryError::InvalidData(format!("invalid uuid in {field}")))
    }

    pub(crate) fn parse_timestamp(s: String, field: &str) -> RepositoryResult<DateTime<Utc>> {
        DateTime::parse_from_rfc3339(&s)
            .map(|dt| dt.with_timezone(&Utc))
            .map_err(|_| RepositoryError::InvalidData(format!("invalid timestamp in {field}")))
    }

    pub(crate) fn parse_role(s: String, field: &str) -> RepositoryResult<Role> {
        match s.as_str() {
            "user" => Ok(Role::User),
            "admin" => Ok(Role::Admin),
            _ => Err(RepositoryError::InvalidData(format!(
                "invalid role '{s}' in {field}"
            ))),
        }
    }

    pub(crate) fn map_db_error(e: sqlx::Error, unique_field: &str) -> RepositoryError {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.message().contains("UNIQUE constraint failed") {
                return RepositoryError::UniqueViolation(unique_field.to_string());
            }
        }
        RepositoryError::Database(e)
    }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/haejoonkim/Desktop/workspace/BrekkyLab/agent-k/backend-v2 && cargo check 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/repository/sqlite.rs
git commit -m "refactor: widen sqlite helper visibility to pub(crate)"
```

---

### Task 2: Extract user domain to `repository/user.rs`

**Files:**
- Create: `src/repository/user.rs`
- Modify: `src/repository/sqlite.rs` (remove user impl block)
- Modify: `src/repository/mod.rs` (remove user DAO types, add re-exports)

- [ ] **Step 1: Create `src/repository/user.rs`** with the full content:

```rust
use chrono::{DateTime, Utc};
use sqlx::Row;
use uuid::Uuid;

use crate::auth::Role;
use crate::repository::{RepositoryError, RepositoryResult};

use super::SqliteRepository;

#[derive(Debug, Clone)]
pub struct DbUser {
    pub id: Uuid,
    pub username: String,
    pub password_hash: String,
    pub role: Role,
    pub display_name: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct NewUser {
    pub id: Uuid,
    pub username: String,
    pub password_hash: String,
    pub role: Role,
    pub display_name: Option<String>,
    pub is_active: bool,
}

pub struct UpdateUser {
    pub display_name: Option<String>,
    pub password_hash: Option<String>,
    pub role: Option<Role>,
    pub is_active: Option<bool>,
}

impl SqliteRepository {
    pub(crate) fn row_to_db_user(row: &sqlx::sqlite::SqliteRow) -> RepositoryResult<DbUser> {
        Ok(DbUser {
            id: Self::parse_uuid(row.get::<String, _>("id"), "users.id")?,
            username: row.get::<String, _>("username"),
            password_hash: row.get::<String, _>("password_hash"),
            role: Self::parse_role(row.get::<String, _>("role"), "users.role")?,
            display_name: row.get::<Option<String>, _>("display_name"),
            is_active: row.get::<i64, _>("is_active") != 0,
            created_at: Self::parse_timestamp(
                row.get::<String, _>("created_at"),
                "users.created_at",
            )?,
            updated_at: Self::parse_timestamp(
                row.get::<String, _>("updated_at"),
                "users.updated_at",
            )?,
        })
    }

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

    pub async fn get_user_by_id(&self, id: Uuid) -> RepositoryResult<Option<DbUser>> {
        let row = sqlx::query(
            "SELECT id, username, password_hash, role, display_name, is_active, created_at, updated_at \
             FROM users WHERE id = ?;",
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await?;

        row.as_ref().map(Self::row_to_db_user).transpose()
    }

    pub async fn get_user_by_username(&self, username: &str) -> RepositoryResult<Option<DbUser>> {
        let row = sqlx::query(
            "SELECT id, username, password_hash, role, display_name, is_active, created_at, updated_at \
             FROM users WHERE username = ?;",
        )
        .bind(username)
        .fetch_optional(&self.pool)
        .await?;

        row.as_ref().map(Self::row_to_db_user).transpose()
    }

    pub async fn list_users(&self, page: u32, size: u32) -> RepositoryResult<(Vec<DbUser>, i64)> {
        let size = size.min(100) as i64;
        let offset = ((page.saturating_sub(1)) as i64) * size;

        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users;")
            .fetch_one(&self.pool)
            .await?;

        let rows = sqlx::query(
            "SELECT id, username, password_hash, role, display_name, is_active, created_at, updated_at \
             FROM users ORDER BY created_at ASC LIMIT ? OFFSET ?;",
        )
        .bind(size)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        let users = rows
            .iter()
            .map(Self::row_to_db_user)
            .collect::<RepositoryResult<Vec<_>>>()?;

        Ok((users, total))
    }

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

    pub async fn delete_user(&self, id: Uuid) -> RepositoryResult<bool> {
        let uid = id.to_string();
        sqlx::query("DELETE FROM sessions WHERE creator_id = ?;")
            .bind(&uid)
            .execute(&self.pool)
            .await?;
        sqlx::query("DELETE FROM projects WHERE owner_id = ?;")
            .bind(&uid)
            .execute(&self.pool)
            .await?;

        let result = sqlx::query("DELETE FROM users WHERE id = ?;")
            .bind(&uid)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn count_admins(&self) -> RepositoryResult<i64> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1;",
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(count)
    }

    pub async fn create_user_with_personal_project(
        &self,
        new_user: NewUser,
    ) -> RepositoryResult<(DbUser, crate::repository::DbProject)> {
        let user = self.create_user(new_user).await?;
        let project = self.create_project("Personal".to_string(), None, user.id).await?;
        Ok((user, project))
    }
}
```

- [ ] **Step 2: Register the module in `repository/mod.rs`** — add at top of file:

```rust
mod user;
pub use user::{DbUser, NewUser, UpdateUser};
```

And remove the existing `DbUser`, `NewUser`, `UpdateUser` struct definitions from `mod.rs` (lines 101–127 in current file).

- [ ] **Step 3: Remove user impl block from `repository/sqlite.rs`** — delete the entire `// ── Users ──` section (lines 287–451 in current file): `row_to_db_user`, `create_user`, `get_user_by_id`, `get_user_by_username`, `list_users`, `update_user`, `delete_user`, `count_admins`. Also remove `create_user_with_personal_project` (lines 654–661).

Also remove unused imports from `sqlite.rs` if any appear after the removal.

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/haejoonkim/Desktop/workspace/BrekkyLab/agent-k/backend-v2 && cargo check 2>&1
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/repository/user.rs src/repository/sqlite.rs src/repository/mod.rs
git commit -m "refactor: extract user domain to repository/user.rs"
```

---

### Task 3: Extract session + message domain to `repository/session.rs`

**Files:**
- Create: `src/repository/session.rs`
- Modify: `src/repository/sqlite.rs` (remove session/message impl block)
- Modify: `src/repository/mod.rs` (remove session DAO types, add re-exports)

- [ ] **Step 1: Create `src/repository/session.rs`** with full content:

```rust
use ailoy::message::Message;
use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::repository::{RepositoryError, RepositoryResult};

use super::SqliteRepository;

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
pub enum SessionAccess {
    Creator,
    ChatMember,
    ReadOnlyMember,
}

#[derive(Debug, Clone)]
pub struct DbSession {
    pub id: Uuid,
    pub project_id: Uuid,
    pub creator_id: Uuid,
    pub share_mode: ShareMode,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl SqliteRepository {
    fn row_to_db_session(row: sqlx::sqlite::SqliteRow) -> RepositoryResult<DbSession> {
        let share_mode_str: String = row.get("share_mode");
        let share_mode = ShareMode::from_str(&share_mode_str)
            .ok_or_else(|| RepositoryError::InvalidData(
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
            share_mode: ShareMode::Private,
            created_at: Self::parse_timestamp(now.clone(), "sessions.created_at")?,
            updated_at: Self::parse_timestamp(now, "sessions.updated_at")?,
        })
    }

    pub async fn get_session(&self, id: Uuid) -> RepositoryResult<Option<DbSession>> {
        let row = sqlx::query(
            "SELECT id, project_id, creator_id, share_mode, created_at, updated_at \
             FROM sessions WHERE id = ?;",
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await?;

        let Some(row) = row else { return Ok(None) };
        Ok(Some(Self::row_to_db_session(row)?))
    }

    pub async fn get_session_with_authz(
        &self,
        session_id: Uuid,
        requesting_user_id: Uuid,
    ) -> RepositoryResult<Option<(DbSession, SessionAccess)>> {
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
            Some("creator") => SessionAccess::Creator,
            Some("chat_member") => SessionAccess::ChatMember,
            Some("readonly_member") => SessionAccess::ReadOnlyMember,
            _ => return Ok(None),
        };

        Ok(Some((Self::row_to_db_session(row)?, access)))
    }

    pub async fn list_sessions_in_project(
        &self,
        project_id: Uuid,
        requesting_user_id: Uuid,
    ) -> RepositoryResult<Vec<DbSession>> {
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
            .map(Self::row_to_db_session)
            .collect()
    }

    pub async fn update_session_share_mode(
        &self,
        session_id: Uuid,
        share_mode: &ShareMode,
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
            return Err(RepositoryError::InvalidData(
                format!("session {session_id} not found"),
            ));
        }

        self.get_session(session_id).await?.ok_or_else(|| {
            RepositoryError::InvalidData("session disappeared after update".into())
        })
    }

    pub async fn delete_session(&self, id: Uuid) -> RepositoryResult<bool> {
        let result = sqlx::query("DELETE FROM sessions WHERE id = ?;")
            .bind(id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn append_messages(
        &self,
        session_id: Uuid,
        messages: &[Message],
    ) -> RepositoryResult<()> {
        if messages.is_empty() {
            return Ok(());
        }

        let now = Self::now_string();
        let sid = session_id.to_string();

        for msg in messages {
            let msg_json = serde_json::to_string(msg)?;
            sqlx::query(
                "INSERT INTO session_messages (session_id, message_json, created_at) \
                 VALUES (?, ?, ?);",
            )
            .bind(&sid)
            .bind(&msg_json)
            .bind(&now)
            .execute(&self.pool)
            .await?;
        }

        sqlx::query("UPDATE sessions SET updated_at = ? WHERE id = ?;")
            .bind(&now)
            .bind(&sid)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn clear_messages(&self, session_id: Uuid) -> RepositoryResult<()> {
        sqlx::query("DELETE FROM session_messages WHERE session_id = ?;")
            .bind(session_id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_messages(&self, session_id: Uuid) -> RepositoryResult<Vec<Message>> {
        let rows = sqlx::query(
            "SELECT message_json FROM session_messages \
             WHERE session_id = ? ORDER BY seq ASC;",
        )
        .bind(session_id.to_string())
        .fetch_all(&self.pool)
        .await?;

        rows.iter()
            .map(|row| {
                let json = row.get::<String, _>("message_json");
                serde_json::from_str::<Message>(&json).map_err(RepositoryError::Serialization)
            })
            .collect()
    }
}
```

- [ ] **Step 2: Register in `repository/mod.rs`** — add:

```rust
mod session;
pub use session::{DbSession, SessionAccess, ShareMode};
```

And remove `ShareMode`, `DbSession`, `SessionAccess` definitions from `mod.rs` (lines 40–99 in current file).

- [ ] **Step 3: Remove session/message impl block from `repository/sqlite.rs`** — delete the entire `// ── Sessions ──` section (lines 54–285, which includes both sessions and messages). Also remove `ailoy::message::Message` and `DbSession` from the `use` imports at the top of `sqlite.rs`.

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/haejoonkim/Desktop/workspace/BrekkyLab/agent-k/backend-v2 && cargo check 2>&1
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/repository/session.rs src/repository/sqlite.rs src/repository/mod.rs
git commit -m "refactor: extract session/message domain to repository/session.rs"
```

---

### Task 4: Extract project + member domain to `repository/project.rs`

**Files:**
- Create: `src/repository/project.rs`
- Modify: `src/repository/sqlite.rs` (remove project/member impl block)
- Modify: `src/repository/mod.rs` (remove project DAO types, add re-exports)

- [ ] **Step 1: Create `src/repository/project.rs`** with full content:

```rust
use chrono::{DateTime, Utc};
use sqlx::Row;
use uuid::Uuid;

use crate::repository::{RepositoryError, RepositoryResult};

use super::SqliteRepository;

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

impl SqliteRepository {
    fn row_to_db_project(row: &sqlx::sqlite::SqliteRow) -> RepositoryResult<DbProject> {
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
        let row = sqlx::query(
            "SELECT id, name, description, owner_id, created_at, updated_at \
             FROM projects WHERE id = ?",
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await?;
        row.as_ref().map(Self::row_to_db_project).transpose()
    }

    pub async fn list_projects_for_user(&self, user_id: Uuid) -> RepositoryResult<Vec<DbProject>> {
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
        let current = self
            .get_project(id)
            .await?
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
    ) -> RepositoryResult<Vec<(crate::repository::DbUser, chrono::DateTime<chrono::Utc>)>> {
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
                let user = Self::row_to_db_user(&r)?;
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
}
```

- [ ] **Step 2: Register in `repository/mod.rs`** — add:

```rust
mod project;
pub use project::{DbProject, DbProjectMember};
```

And remove `DbProject`, `DbProjectMember` definitions from `mod.rs` (lines 67–82 in current file).

- [ ] **Step 3: Remove project/member impl block from `repository/sqlite.rs`** — delete the `// ── Projects ──` and `// ── Project Members ──` sections (lines 453–661 in current file). After this task, the entire top-level `use` block in `sqlite.rs` should be reduced to:

```rust
use chrono::{DateTime, SecondsFormat, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    auth::Role,
    repository::{RepositoryError, RepositoryResult},
};
```

All domain-specific imports (`ailoy`, `Row`, `DbUser`, `DbProject`, `DbSession`, `NewUser`, `UpdateUser`) now live in their respective domain files.

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/haejoonkim/Desktop/workspace/BrekkyLab/agent-k/backend-v2 && cargo check 2>&1
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/repository/project.rs src/repository/sqlite.rs src/repository/mod.rs
git commit -m "refactor: extract project/member domain to repository/project.rs"
```

---

### Task 5: Fix `model/` — move `SessionListResponse` to correct file

**Files:**
- Modify: `src/model/session.rs`
- Modify: `src/model/project.rs`

`SessionListResponse` is currently at the bottom of `model/project.rs` but conceptually belongs with sessions.

- [ ] **Step 1: Add `SessionListResponse` to `model/session.rs`** — append at end of file:

```rust
#[derive(Debug, Serialize, JsonSchema)]
pub struct SessionListResponse {
    pub items: Vec<SessionResponse>,
}
```

- [ ] **Step 2: Remove `SessionListResponse` from `model/project.rs`** — delete the last struct (lines 69–72 in current file):

```rust
#[derive(Debug, Serialize, JsonSchema)]
pub struct SessionListResponse {
    pub items: Vec<crate::model::SessionResponse>,
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/haejoonkim/Desktop/workspace/BrekkyLab/agent-k/backend-v2 && cargo check 2>&1
```

Expected: no errors. `handlers/session.rs` imports `SessionListResponse` from `crate::model` — since `model/mod.rs` does `pub use session::*`, the re-export path is unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/model/session.rs src/model/project.rs
git commit -m "refactor: move SessionListResponse to model/session.rs"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/haejoonkim/Desktop/workspace/BrekkyLab/agent-k/backend-v2 && cargo test 2>&1
```

Expected: all tests pass. The `#[cfg(test)]` block remains in `sqlite.rs` and all test helpers (`make_repo`, `make_user`, `make_project`) are still in scope there.

- [ ] **Step 2: Check final file sizes**

```bash
wc -l src/repository/sqlite.rs src/repository/user.rs src/repository/session.rs src/repository/project.rs src/repository/mod.rs
```

Expected approximate sizes:
- `sqlite.rs` ~60 lines (struct + helpers + tests)  
- `user.rs` ~120 lines
- `session.rs` ~180 lines
- `project.rs` ~160 lines
- `mod.rs` ~60 lines (error types + factory fns + re-exports)
