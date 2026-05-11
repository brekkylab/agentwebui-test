# Repository Domain Split Design

## Goal

Split the monolithic `repository/sqlite.rs` (941 lines) into domain-scoped files,
and co-locate DAO types with their implementation. Fix a misplaced DTO in `model/`.

## Final Structure

```
src/repository/
  mod.rs       — RepositoryError, RepositoryResult, AppRepository, factory fns, re-exports
  sqlite.rs    — SqliteRepository struct, shared helpers (parse_uuid, parse_timestamp,
                 parse_role, map_db_error, now_string)
  user.rs      — DbUser, NewUser, UpdateUser + impl SqliteRepository { user methods } + tests
  session.rs   — DbSession, SessionAccess, ShareMode + impl SqliteRepository { session + message methods } + tests
  project.rs   — DbProject, DbProjectMember + impl SqliteRepository { project + member methods }
```

### Why session.rs includes messages

`session_messages` is a child table of `sessions` with shared lifecycle (cascade deletes).
Keeping them together avoids cross-file dependencies within the repository layer.

## DAO Type Movements

| Type | From | To |
|------|------|----|
| `DbUser`, `NewUser`, `UpdateUser` | `repository/mod.rs` | `repository/user.rs` |
| `DbProject`, `DbProjectMember` | `repository/mod.rs` | `repository/project.rs` |
| `DbSession`, `SessionAccess`, `ShareMode` | `repository/mod.rs` | `repository/session.rs` |

All types remain re-exported from `repository/mod.rs` so external paths (`crate::repository::DbUser` etc.) are unchanged — no changes needed in `handlers/` or `model/`.

## model/ Fix

`SessionListResponse` is currently in `model/project.rs` but belongs in `model/session.rs`. Move it there and update the reference in `model/project.rs` if needed.

## Constraints

- No changes to public API surface (`AppRepository`, error types, DAO field names)
- No new dependencies
- All existing tests pass unchanged
- `ShareMode` stays in `repository` (not moved to `model`) — it is a DB-level type re-exported through `model/session.rs`
