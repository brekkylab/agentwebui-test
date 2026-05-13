# Cowork App Interaction Audit + API Contract Gap Report

Generated: 2026-05-14 KST  
Scope: `app/` mock frontend after feature split cleanup, compared with `backend-v2` current routes/models.  
Primary evidence:
- Rendered app audit: `app/docs/interaction-audit.json`
- Frontend contracts: `app/src/domain/types.ts`, `app/src/services/coworkApi.ts`, `app/src/App.tsx`, `app/src/features/**`
- Backend contracts: `backend-v2/src/router.rs`, `backend-v2/src/model/*.rs`, `backend-v2/src/handlers/*.rs`, `backend-v2/migrations/0003_projects_and_sessions.sql`

## 0. Executive summary

The current frontend is not just a static mock. It assumes a project workspace product with these major state domains:

1. authenticated user + visible projects
2. project members and roles
3. sessions with title, intent, model, sharing, references, latest preview, unread state, and artifacts
4. message history with human/AI roles, citations, streaming/thinking state, and feedback actions
5. project files as ground-truth inputs, including folders, metadata, summaries, selection, pinning, and upload
6. generated artifacts with evidence back-links
7. reusable project skills, including runnable skills
8. schedules that trigger skills or free prompts and write to sessions or activity feed
9. project activity feed and notification-like status toasts

`backend-v2` already covers a useful foundation: auth, users, projects, members, basic sessions, share mode, message send/history/SSE, project dirent upload/list/get/delete, and a separate document store. However, it does **not** yet expose enough API shape to run the current app as-is because it lacks session metadata, file metadata/indexing, references/citations, artifacts, skills, schedules, activity feed, and a bootstrap/BFF aggregation surface.

## 1. Exhaustive frontend behavior inventory

### 1.1 Rendered audit evidence

`app/docs/interaction-audit.json` was produced by Chrome/Playwright against `http://127.0.0.1:4100/`.

Observed pass summary:

| Scenario | Result | Evidence snapshot |
|---|---:|---|
| Projects index shows project cards and New project control | PASS | `projects-index` |
| Create project creates project + kickoff session + seed file | PASS | `project-create-result` |
| Project home opens sessions/activity; New session creates intent session | PASS | `session-create-result` |
| Files supports folder browse, empty search, upload, pin to session | PASS | `files-upload-pin-result` |
| Session supports share mode, send message, generate artifact | PASS | `session-send-artifact-result` |
| Skills supports list, mention copy, create, edit, run | PASS | `skills-create-edit-run-result` |
| Schedule supports pause/resume, create prompt schedule, run to feed/session | PASS | `schedule-activity-result`, `schedule-new-session-result` |
| Members and Settings render | PASS | `members-page`, `settings-page` |
| Mobile first page loads without horizontal overflow | PASS | `mobile.hasHorizontalOverflow=false` |
| Console errors/warnings during audit | PASS | `console=[]` |

The audit intentionally touched all visible primary controls except destructive delete flows. Delete flows are still covered as frontend code paths for skills/schedules, but not executed in the audit to preserve subsequent scenario state.

### 1.2 Projects surface

Current visible behavior:
- `Projects` index lists all visible projects with role badge, description, member avatars, session count, latest timestamp.
- Sidebar project switch changes `activeProjectId`, first session, selected folder, selected files, and route.
- `New project` dialog asks `name` and `description`.
- Creating a project also creates a kickoff session and a starter file, then routes to project home.
- Project Home shows project title/description, members, files count, session cards, activity rows, and `New session`.

Required durable API state:

```ts
Project {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  memberIds: string[];       // owner should be explicit or separately marked
  isPersonal?: boolean;
  createdAt: string;
  updatedAt: string;
  stats?: {
    sessionCount: number;
    fileCount: number;
    latestSessionUpdatedAt?: string;
    unreadCount?: number;
  };
  currentUserRole: 'owner' | 'member' | 'viewer';
}
```

Suggested endpoints:
- `GET /app/bootstrap` or `GET /projects?include=members,stats,recent_sessions`
- `POST /projects { name, description }`
- `GET /projects/{project_id}`
- `PATCH /projects/{project_id} { name?, description? }`
- `DELETE /projects/{project_id}`

Backend-v2 coverage:
- Covered partially: `GET/POST /projects`, `GET/PATCH/DELETE /projects/{project_id}`.
- Missing for frontend: project stats, `memberIds` in project list, `currentUserRole`, personal marker, latest session preview, and single bootstrap aggregation.

### 1.3 Members and auth/user identity

Current visible behavior:
- Sidebar shows current user avatar, name, email.
- Project members page lists avatar, name, email, role label.
- Auth mock can switch current user locally; real onboarding/auth is intentionally outside the main mock flow.

Required API state:

```ts
User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatar?: string;     // initials or URL
  color?: string;      // UI fallback color
  roleLabel?: string;  // product/team role, not only admin/user
}
ProjectMember {
  userId: string;
  role: 'owner' | 'member' | 'viewer';
  addedAt: string;
}
```

Suggested endpoints:
- `POST /auth/login`, `POST /auth/signup`
- `GET /me`, `PATCH /me`
- `GET /projects/{project_id}/members`
- `POST /projects/{project_id}/members { username, role? }`
- `PATCH /projects/{project_id}/members/{user_id} { role }` (needed once viewer/editor roles exist)
- `DELETE /projects/{project_id}/members/{user_id}`

Backend-v2 coverage:
- Covered partially: auth login/signup, `GET/PATCH /me`, member list/add/remove.
- Missing for frontend: email/avatar/color/team-role fields, member role changes, owner included in member list or project response, non-admin user search/invite preview.

### 1.4 Sessions list and project home session cards

Current visible behavior:
- Session cards show title, intent icon, share pill, latest message preview, participants, unread badge/caught-up state, and compact timestamp.
- Private/shared-readonly/shared-chat modes affect access pill.
- Project home filters sessions by project and opens a session.
- Schedule-created sessions and skill-run sessions appear in the same session list.

Required API state:

```ts
Session {
  id: string;
  projectId: string;
  title: string;
  creatorId: string;
  shareMode: 'private' | 'shared_readonly' | 'shared_chat';
  intent: 'general' | 'analysis' | 'brainstorm' | 'writing' | 'recap';
  model: string;
  references: string[];      // project file ids / paths pinned to the session
  artifactId?: string;
  isAutoAppend?: boolean;
  createdAt: string;
  updatedAt: string;
  latestMessagePreview?: { senderId: string; body: string; createdAt: string };
  unreadCount?: number;
  participants?: string[];
}
```

Suggested endpoints:
- `GET /projects/{project_id}/sessions?include=preview,participants,artifact,unread`
- `POST /projects/{project_id}/sessions { title, intent, share_mode?, reference_file_ids?, model? }`
- `GET /sessions/{session_id}`
- `PATCH /sessions/{session_id} { title?, intent?, share_mode?, model? }`
- `DELETE /sessions/{session_id}`
- `PUT /sessions/{session_id}/references { file_ids: string[] }`
- `POST /sessions/{session_id}/references { file_ids: string[] }`
- `DELETE /sessions/{session_id}/references/{file_id}`

Backend-v2 coverage:
- Covered partially: create/list/get/update share/delete sessions.
- Major gap: `CreateSessionRequest` is empty, and `SessionResponse` has no title, intent, model, references, artifact id, latest preview, unread count, or participant list.

### 1.5 Session detail, messages, streaming, citations, feedback

Current visible behavior:
- Session heading shows title, starter, file count, model, intent badge, and share select.
- Message list renders self/other/AI differently.
- AI messages can show file citation chips.
- Composer sends a user message, clears input, shows thinking state, and appends AI reply.
- Selected project files are sent as ground-truth references.
- AI message actions are visible: `Copy`, `Regenerate`, `Good`.
- Artifact button generates a decision artifact from the selected/pinned files.

Required API state:

```ts
Message {
  id: string;
  sessionId: string;
  senderId: string;            // user id or 'ai'
  role: 'user' | 'assistant' | 'system' | 'tool';
  createdAt: string;
  body: string;
  status: 'sent' | 'streaming' | 'done' | 'failed';
  citations?: Array<{
    fileId: string;
    path?: string;
    quote?: string;
    span?: { start?: number; end?: number };
    confidence?: number;
  }>;
  toolCalls?: ToolCall[];
  artifactIds?: string[];
  parentMessageId?: string;
}
```

Suggested endpoints:
- `GET /sessions/{session_id}/messages?after_seq=&limit=`
- `POST /sessions/{session_id}/messages { content, referenced_file_ids, client_message_id }`
- `POST /sessions/{session_id}/messages/stream { content, referenced_file_ids, client_message_id }` with events:
  - `user_message.created`
  - `assistant_message.delta`
  - `assistant_message.completed`
  - `tool_call.started|delta|completed`
  - `citation.added`
  - `artifact.created`
  - `run.failed`
  - `done`
- `POST /messages/{message_id}/regenerate { referenced_file_ids?, instruction? }`
- `POST /messages/{message_id}/feedback { rating: 'good' | 'bad', note? }`
- `POST /messages/{message_id}/copy` is optional analytics only; copying can remain client-side.

Backend-v2 coverage:
- Covered partially: `GET /sessions/{session_id}/messages`, `POST /sessions/{session_id}/messages`, `POST /sessions/{session_id}/messages/stream`, `DELETE /sessions/{session_id}/messages`.
- Major gap: `SendMessageRequest` only accepts `{ content }`; no referenced file ids, no client message id, no citation contract, no normalized frontend message shape, no feedback/regenerate endpoint.
- SSE exists, but current event stream emits raw `MessageOutput` as `message` events plus `done`; it does not expose the product-level event taxonomy above.

### 1.6 Files as ground truth

Current visible behavior:
- Files page is a two-pane project file browser.
- Folder rail is computed from file paths.
- Search filters visible files.
- Upload dialog creates a mock file under selected folder.
- Empty state appears when query has no match.
- Selected files can be pinned to a session as ground truth.
- File type controls icon and visual anatomy: pdf/sheet/doc/image/folder.
- Session side panel and artifacts cite files by id/name.

Required API state:

```ts
FileAsset {
  id: string;             // stable backend id or stable project-relative path
  projectId: string;
  name: string;
  path: string;
  type: 'pdf' | 'sheet' | 'doc' | 'image' | 'folder';
  mimeType?: string;
  bytes?: number;
  sizeLabel?: string;
  updatedAt: string;
  createdBy?: string;
  summary?: string;
  groundTruth?: string[];
  indexStatus?: 'pending' | 'indexed' | 'failed';
  documentId?: string;    // link to knowledge/index document if separate
}
```

Suggested endpoints:
- `GET /projects/{project_id}/files?prefix=&recursive=&q=&include=summary,index_status`
- `POST /projects/{project_id}/files` multipart with fields `path`, `file`, optional `folder`
- `POST /projects/{project_id}/folders { path }` for empty folders
- `GET /projects/{project_id}/files/{path}` download
- `PATCH /projects/{project_id}/files/{path} { name?, summary?, ground_truth? }`
- `DELETE /projects/{project_id}/files/{path}`
- `POST /projects/{project_id}/files/index { paths: string[] }`
- `GET /projects/{project_id}/files/{path}/index-status`

Backend-v2 coverage:
- Covered partially by dirents: upload/list/get/delete with `path`, `kind`, `bytes`, `modified_at`.
- Missing for frontend: stable `id` separate from path, type/mime summary, ground-truth extraction summary, index status, empty folder creation, file rename/move, explicit project-file-to-document indexing status.
- Existing `/documents` is not enough as-is because it is separate from project dirents and appears not project-scoped/auth-layered in `router.rs`.

### 1.7 Artifacts

Current visible behavior:
- Session Artifact button generates a `team_decision_record` artifact.
- Artifact has status, sections, evidence file ids, and next actions.
- Artifact is attached to the session side panel.

Required API state:

```ts
Artifact {
  id: string;
  sessionId: string;
  title: string;
  kind: 'team_decision_record' | 'memo' | 'brief' | 'table' | string;
  status: 'draft' | 'ready' | 'failed';
  generatedFromFileIds: string[];
  sections: Array<{ label: string; body: string; evidence?: string[] }>;
  nextActions: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```

Suggested endpoints:
- `POST /sessions/{session_id}/artifacts { kind, file_ids, instruction? }`
- `GET /sessions/{session_id}/artifacts`
- `GET /artifacts/{artifact_id}`
- `PATCH /artifacts/{artifact_id} { title?, sections?, status? }`
- `DELETE /artifacts/{artifact_id}`
- `POST /artifacts/{artifact_id}/export { format: 'markdown' | 'pdf' | 'docx' }`

Backend-v2 coverage:
- Not covered. No artifact table/model/routes.

### 1.8 Skills

Current visible behavior:
- Skills tab lists project skills with `📖` reference or `📖▶` runnable mode.
- Skill card shows name, description, when-to-use, tool bindings, default intent, author, updated time.
- Owner can create, edit, delete.
- Mention copy produces `@skill-name` or clipboard fallback notice.
- Runnable skill creates a new session, user prompt message, and AI result message.

Required API state:

```ts
Skill {
  id: string;
  projectId: string;
  name: string;
  description: string;
  whenToUse: string;
  body: string;
  runnable: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  promptTemplate?: string;
  toolBindings?: string[];
  defaultIntent?: SessionIntent;
  sourceSessionId?: string;
  sourceMessageRange?: { startTurn: number; endTurn: number };
}
```

Suggested endpoints:
- `GET /projects/{project_id}/skills`
- `POST /projects/{project_id}/skills { name, description, when_to_use, body, runnable, prompt_template?, tool_bindings?, default_intent? }`
- `GET /skills/{skill_id}`
- `PATCH /skills/{skill_id}`
- `DELETE /skills/{skill_id}`
- `POST /skills/{skill_id}/run { project_id, reference_file_ids?, result: { kind: 'new_session' | 'append_to_session', session_id? } }`
- `POST /sessions/{session_id}/skills { message_range, name?, runnable? }` to lift a session moment into a skill.

Backend-v2 coverage:
- Not covered. No skills model/routes/storage/executor boundary.

### 1.9 Schedule

Current visible behavior:
- Schedule tab lists project schedules.
- Owner can create/edit/delete/pause/resume.
- Schedule supports daily/weekly/monthly cron-like settings.
- Trigger can be runnable skill or free prompt.
- Result target can be new session each time, append to existing session, or activity feed only.
- Notify users are selectable.
- `Run now` immediately creates session/message or activity feed row.

Required API state:

```ts
Schedule {
  id: string;
  projectId: string;
  cron: string;
  friendlyTime: string;
  timezone: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  trigger: { kind: 'skill'; skillId: string } | { kind: 'prompt'; prompt: string };
  resultTarget:
    | { kind: 'new_session_each_time' }
    | { kind: 'append_to_session'; sessionId: string }
    | { kind: 'activity_feed_only' };
  resultSessionShareMode?: ShareMode;
  notifyUserIds: string[];
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'failed' | 'running';
}
```

Suggested endpoints:
- `GET /projects/{project_id}/schedules`
- `POST /projects/{project_id}/schedules`
- `GET /schedules/{schedule_id}`
- `PATCH /schedules/{schedule_id}`
- `DELETE /schedules/{schedule_id}`
- `POST /schedules/{schedule_id}/pause`
- `POST /schedules/{schedule_id}/resume`
- `POST /schedules/{schedule_id}/run-now`
- `GET /schedules/{schedule_id}/runs`

Backend-v2 coverage:
- Not covered. No schedules, runs, background worker, next-run calculation, notification targets, or activity feed integration.

### 1.10 Activity feed, notifications, and non-visible but necessary session internals

Current visible behavior:
- Project home has activity rows.
- Schedule activity-feed run adds an entry.
- Toast notices report mutations.

Non-visible but necessary once real API exists:
- run lifecycle status: queued/running/streaming/persisting/failed/succeeded
- message failure state and retry
- tool call visibility and audit trail
- citation provenance: file path, chunk/document id, quote/span, confidence
- session concurrency/lock state: backend-v2 already returns locked errors in message handlers; UI needs a clear state
- notification delivery/read state for schedules and mentions
- unread counts per user/session
- permission decisions per control: can edit project, can create skill, can run schedule, can chat, can read only
- optimistic update reconciliation with server ids
- idempotency via `client_message_id` / mutation ids

Suggested endpoints:
- `GET /projects/{project_id}/activity?after=&limit=`
- `GET /sessions/{session_id}/runs/{run_id}`
- `GET /sessions/{session_id}/events?after=` or consolidated SSE/WebSocket
- `POST /notifications/read { ids }`
- `GET /notifications`
- `GET /projects/{project_id}/permissions` or include `capabilities` in bootstrap responses

Backend-v2 coverage:
- Minimal only: session lock errors exist in message send/stream path. No activity, notification, unread, run, or frontend permission envelope.

## 2. Current backend-v2 API coverage matrix

| Domain | Frontend need | backend-v2 coverage | Fit |
|---|---|---|---:|
| Auth | login/signup/current user | `POST /auth/signup`, `POST /auth/login`, `GET/PATCH /me` | Medium |
| User profile | display name/email/avatar/color/team role | `UserResponse` has username/display_name/role/is_active only | Low |
| Projects | list/create/get/update/delete | `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}` | Medium-high |
| Members | list/add/remove, role display | `GET/POST /projects/{id}/members`, `DELETE /projects/{id}/members/{user_id}` | Medium |
| Sessions | list/create/get/share/delete | routes exist | Low-medium because metadata is too thin |
| Session messages | history/send/stream/clear | routes exist | Medium for raw agent chat, low for product UI contract |
| Project files | upload/list/download/delete | dirent routes exist | Medium for file storage, low for ground-truth metadata/indexing |
| Knowledge documents | project file indexing/corpus | `/documents` exists | Low because separate/global/auth mismatch vs app project files |
| Artifacts | generate/list/edit/export evidence-backed artifact | none | None |
| Skills | CRUD/run/lift from session | none | None |
| Schedules | CRUD/run/pause/activity targets | none | None |
| Activity feed | project timeline, schedule output | none | None |
| Notifications/unread | per-user state | none | None |
| Bootstrap/BFF | one app load payload | none | None |

## 3. Priority list for backend API work

### P0 — make the current app usable against a real backend

#### P0.1 Add an app bootstrap or frontend BFF response

Why: the frontend currently loads a full `BootstrapPayload` before rendering. Without aggregation, the app must make many waterfall requests and synthesize missing metadata client-side.

Proposal:

```http
GET /app/bootstrap
Authorization: Bearer <token>
```

Response:

```json
{
  "currentUserId": "uuid",
  "users": [],
  "projects": [],
  "sessions": [],
  "messages": [],
  "files": [],
  "artifacts": [],
  "skills": [],
  "schedules": [],
  "activityFeed": [],
  "capabilities": {
    "canCreateProject": true,
    "canCreateSkill": true,
    "canCreateSchedule": true
  }
}
```

If BFF is rejected, define a required startup call sequence and make every list endpoint support `updated_since` to avoid repeated heavy loads.

#### P0.2 Expand session metadata contract

Backend change:
- Add columns or side table fields: `title`, `intent`, `model`, `artifact_id?`, `is_auto_append?`.
- Add `session_references(session_id, file_id/path, added_by, added_at)`.
- Add create/update payload fields.

Minimum request:

```json
POST /projects/{project_id}/sessions
{
  "title": "Q2 market read — starting points",
  "intent": "analysis",
  "share_mode": "shared_chat",
  "reference_file_ids": ["file-market", "file-competitor"],
  "model": "Cowork Default"
}
```

Minimum response: same `Session` shape from section 1.4.

#### P0.3 Normalize message send/history/stream for UI

Backend change:
- Accept `referenced_file_ids` and `client_message_id`.
- Persist normalized user/assistant messages with role/body/status/citations.
- Return or stream product-level events, not only raw agent outputs.

Minimum request:

```json
POST /sessions/{session_id}/messages
{
  "content": "Summarize the selected evidence.",
  "referenced_file_ids": ["file-market"],
  "client_message_id": "uuid-from-client"
}
```

Minimum response:

```json
{
  "userMessage": { "id": "...", "role": "user", "body": "...", "citations": ["file-market"] },
  "assistantMessage": { "id": "...", "role": "assistant", "body": "...", "citations": [{ "fileId": "file-market" }] },
  "runId": "..."
}
```

#### P0.4 Project file metadata + session references

Backend change:
- Keep dirents for storage, but add a file metadata/index layer.
- Make project files addressable by stable id or path with consistent mapping.
- Expose summary/index status for the app.

Minimum endpoints:
- `GET /projects/{project_id}/files`
- `POST /projects/{project_id}/files` multipart
- `POST /projects/{project_id}/folders`
- `PUT /sessions/{session_id}/references`

#### P0.5 Permission envelope

Every project/session response should include enough permission flags to avoid guessing UI affordances:

```json
"permissions": {
  "canChat": true,
  "canRead": true,
  "canChangeShareMode": false,
  "canCreateSkill": false,
  "canCreateSchedule": false,
  "canManageMembers": false
}
```

### P1 — make the product’s core differentiated features real

#### P1.1 Artifacts API

Required for `Artifact` button and evidence-backed outputs. Add artifact table, generation route, list/get/update/export.

#### P1.2 Skills CRUD + run API

Required for team-owned reusable capability. Add project skills table, owner/member permission rules, runnable executor integration.

#### P1.3 Schedule CRUD + run engine

Required for automatic session/activity generation. Add schedule table, schedule_runs table, pause/resume/run-now, result-target handling, worker ownership, and failure reporting.

#### P1.4 Activity feed

Required for project home and schedule `activity_feed_only` target.

#### P1.5 Regenerate/feedback APIs

Required because AI message controls already show `Regenerate` and `Good`. Copy can stay local unless analytics is needed.

### P2 — improve scale, polish, and collaboration state

- Search/filter endpoints for projects/sessions/files/messages.
- Unread/read receipts per user/session.
- Notification inbox and schedule notifications.
- Message edit/delete/threading if product direction needs it.
- Artifact export formats and version history.
- Audit log for project-level mutations.
- File rename/move and folder tree mutations.

## 4. Backend handoff checklist

A backend developer can start from these implementation slices:

1. **Session metadata migration**
   - Add `title`, `intent`, `model`, `artifact_id`, `is_auto_append` to sessions.
   - Add `session_references` table.
   - Update `CreateSessionRequest`, `UpdateSessionRequest`, `SessionResponse`.

2. **Normalized message contract**
   - Add message DTO independent from raw `ailoy::message::Message`.
   - Persist `role`, `sender_id`, `body`, `status`, `citations`, `client_message_id`, `run_id`.
   - Keep raw agent output separately if needed.

3. **Project files metadata/index bridge**
   - Treat dirent upload as storage layer.
   - Add project file metadata and optional link to document/index id.
   - Project-scope `/documents` or replace with `/projects/{project_id}/files/index`.

4. **Bootstrap/BFF**
   - Either add `GET /app/bootstrap` or define canonical startup call sequence.
   - Include permissions and summary stats.

5. **Artifacts**
   - Add artifact routes and evidence schema.

6. **Skills**
   - Add project skills CRUD and run behavior.

7. **Schedules + activity feed**
   - Add schedules, schedule runs, activity feed entries, and run-now route.

## 5. Current verification evidence

Commands already run after feature split cleanup:

```bash
pnpm -C app lint
pnpm -C app build
pnpm -C app test:e2e
```

Results:
- TypeScript lint/typecheck: PASS
- Production build: PASS
- Playwright e2e: PASS, 20/20 tests
- Manual Chrome/Playwright interaction audit: PASS, 8/8 scenario groups, 0 console issues
- Mobile first page: PASS, no horizontal overflow

Screenshots from the visual smoke run were saved under `/tmp/cowork-feature-split-*.png` during verification. The durable structured audit is committed to `app/docs/interaction-audit.json`.

## 6. Known limits of this report

- Destructive delete controls were not clicked in the full interaction audit, but their code paths were inspected and the e2e suite covers create/run flows.
- Backend-v2 was analyzed from source routes/models/migrations, not by launching a live backend server with seeded data.
- The suggested API names are intentionally concrete but not final protocol law; the important contract is the shape, ownership, permission, and event semantics.
