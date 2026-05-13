# Cowork App 상호작용 감사 + API 계약 Gap 보고서

생성일: 2026-05-14 KST  
범위: feature split cleanup 이후의 `app/` mock frontend와 현재 `backend-v2` routes/models 비교.  
주요 근거:
- 렌더링된 앱 감사: `app/docs/interaction-audit.json`
- 프론트엔드 계약: `app/src/domain/types.ts`, `app/src/services/coworkApi.ts`, `app/src/App.tsx`, `app/src/features/**`
- 백엔드 계약: `backend-v2/src/router.rs`, `backend-v2/src/model/*.rs`, `backend-v2/src/handlers/*.rs`, `backend-v2/migrations/0003_projects_and_sessions.sql`

## 0. 핵심 요약

현재 프론트엔드는 단순 정적 mock이 아니다. 이 앱은 project workspace 제품으로서 아래 주요 상태 도메인을 전제로 한다.

1. 인증된 사용자 + 사용자가 볼 수 있는 projects
2. project members와 역할
3. title, intent, model, sharing, references, latest preview, unread state, artifacts를 가진 sessions
4. human/AI roles, citations, streaming/thinking state, feedback actions를 가진 message history
5. folders, metadata, summaries, selection, pinning, upload을 포함한 project files as ground truth
6. evidence back-link를 가진 generated artifacts
7. project 단위 reusable skills, runnable skills 포함
8. skills 또는 free prompt를 trigger하고 sessions/activity feed에 쓰는 schedules
9. project activity feed와 mutation/toast 성격의 status notices

`backend-v2`는 이미 유용한 기반을 제공한다. 현재 있는 것은 auth, users, projects, members, basic sessions, share mode, message send/history/SSE, project dirent upload/list/get/delete, 별도 document store다. 하지만 현재 app을 그대로 붙여 real API로 사용하기에는 아직 충분하지 않다. 부족한 핵심은 session metadata, file metadata/indexing, references/citations, artifacts, skills, schedules, activity feed, bootstrap/BFF aggregation surface다.

## 1. 프론트엔드 동작 전수 인벤토리

### 1.1 렌더링 감사 근거

`app/docs/interaction-audit.json`은 Chrome/Playwright로 `http://127.0.0.1:4100/`에 접속해 생성했다.

관찰된 pass 요약:

| 시나리오 | 결과 | 근거 snapshot |
|---|---:|---|
| Projects index가 project cards와 New project control을 표시 | PASS | `projects-index` |
| Project 생성 시 project + kickoff session + seed file 생성 | PASS | `project-create-result` |
| Project home에서 sessions/activity 확인, New session이 intent session 생성 | PASS | `session-create-result` |
| Files에서 folder browse, empty search, upload, pin to session 동작 | PASS | `files-upload-pin-result` |
| Session에서 share mode 변경, message send, artifact 생성 동작 | PASS | `session-send-artifact-result` |
| Skills에서 list, mention copy, create, edit, run 동작 | PASS | `skills-create-edit-run-result` |
| Schedule에서 pause/resume, prompt schedule 생성, feed/session run 동작 | PASS | `schedule-activity-result`, `schedule-new-session-result` |
| Members와 Settings render | PASS | `members-page`, `settings-page` |
| Mobile first page가 horizontal overflow 없이 로딩 | PASS | `mobile.hasHorizontalOverflow=false` |
| 감사 중 console errors/warnings | PASS | `console=[]` |

감사는 모든 visible primary controls를 의도적으로 만졌다. 단, destructive delete flow는 이후 시나리오 상태를 보존하기 위해 클릭하지 않았다. skills/schedules delete code path는 프론트엔드 코드상 존재하지만 interaction audit에서는 실행하지 않았다.

### 1.2 Projects surface

현재 보이는 동작:
- `Projects` index는 사용자가 볼 수 있는 모든 projects를 role badge, description, member avatars, session count, latest timestamp와 함께 보여준다.
- Sidebar project switch는 `activeProjectId`, first session, selected folder, selected files, route를 바꾼다.
- `New project` dialog는 `name`과 `description`을 입력받는다.
- Project를 만들면 kickoff session과 starter file도 함께 만들고 project home으로 이동한다.
- Project Home은 project title/description, members, files count, session cards, activity rows, `New session`을 보여준다.

필요한 durable API state:

```ts
Project {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  memberIds: string[];       // owner도 명시하거나 별도 필드로 표시 필요
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

제안 endpoints:
- `GET /app/bootstrap` 또는 `GET /projects?include=members,stats,recent_sessions`
- `POST /projects { name, description }`
- `GET /projects/{project_id}`
- `PATCH /projects/{project_id} { name?, description? }`
- `DELETE /projects/{project_id}`

`backend-v2` coverage:
- 부분적으로 커버됨: `GET/POST /projects`, `GET/PATCH/DELETE /projects/{project_id}`.
- 프론트엔드 기준 부족한 점: project stats, project list의 `memberIds`, `currentUserRole`, personal marker, latest session preview, 단일 bootstrap aggregation.

### 1.3 Members와 auth/user identity

현재 보이는 동작:
- Sidebar는 current user avatar, name, email을 보여준다.
- Project members page는 avatar, name, email, role label을 보여준다.
- Auth mock은 current user를 local state에서 전환한다. 실제 onboarding/auth는 의도적으로 main mock flow 밖에 있다.

필요한 API state:

```ts
User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatar?: string;     // initials 또는 URL
  color?: string;      // UI fallback color
  roleLabel?: string;  // admin/user가 아니라 product/team role
}
ProjectMember {
  userId: string;
  role: 'owner' | 'member' | 'viewer';
  addedAt: string;
}
```

제안 endpoints:
- `POST /auth/login`, `POST /auth/signup`
- `GET /me`, `PATCH /me`
- `GET /projects/{project_id}/members`
- `POST /projects/{project_id}/members { username, role? }`
- `PATCH /projects/{project_id}/members/{user_id} { role }` — viewer/editor role이 생기면 필요
- `DELETE /projects/{project_id}/members/{user_id}`

`backend-v2` coverage:
- 부분적으로 커버됨: auth login/signup, `GET/PATCH /me`, member list/add/remove.
- 프론트엔드 기준 부족한 점: email/avatar/color/team-role fields, member role 변경, owner가 member list나 project response에 명시되는 방식, non-admin user search/invite preview.

### 1.4 Sessions list와 project home session cards

현재 보이는 동작:
- Session cards는 title, intent icon, share pill, latest message preview, participants, unread badge/caught-up state, compact timestamp를 보여준다.
- private/shared-readonly/shared-chat modes는 access pill에 반영된다.
- Project home은 sessions를 project 기준으로 필터링하고 session을 연다.
- schedule-created sessions와 skill-run sessions도 같은 session list에 나타난다.

필요한 API state:

```ts
Session {
  id: string;
  projectId: string;
  title: string;
  creatorId: string;
  shareMode: 'private' | 'shared_readonly' | 'shared_chat';
  intent: 'general' | 'analysis' | 'brainstorm' | 'writing' | 'recap';
  model: string;
  references: string[];      // session에 pin된 project file ids / paths
  artifactId?: string;
  isAutoAppend?: boolean;
  createdAt: string;
  updatedAt: string;
  latestMessagePreview?: { senderId: string; body: string; createdAt: string };
  unreadCount?: number;
  participants?: string[];
}
```

제안 endpoints:
- `GET /projects/{project_id}/sessions?include=preview,participants,artifact,unread`
- `POST /projects/{project_id}/sessions { title, intent, share_mode?, reference_file_ids?, model? }`
- `GET /sessions/{session_id}`
- `PATCH /sessions/{session_id} { title?, intent?, share_mode?, model? }`
- `DELETE /sessions/{session_id}`
- `PUT /sessions/{session_id}/references { file_ids: string[] }`
- `POST /sessions/{session_id}/references { file_ids: string[] }`
- `DELETE /sessions/{session_id}/references/{file_id}`

`backend-v2` coverage:
- 부분적으로 커버됨: create/list/get/update share/delete sessions.
- 큰 gap: `CreateSessionRequest`가 비어 있고, `SessionResponse`에는 title, intent, model, references, artifact id, latest preview, unread count, participant list가 없다.

### 1.5 Session detail, messages, streaming, citations, feedback

현재 보이는 동작:
- Session heading은 title, starter, file count, model, intent badge, share select를 보여준다.
- Message list는 self/other/AI를 다르게 렌더링한다.
- AI messages는 file citation chips를 보여줄 수 있다.
- Composer는 user message를 보내고 input을 비우며 thinking state를 보여준 뒤 AI reply를 append한다.
- 선택된 project files는 ground-truth references로 함께 보낸다.
- AI message actions가 보인다: `Copy`, `Regenerate`, `Good`.
- Artifact button은 selected/pinned files를 기반으로 decision artifact를 생성한다.

필요한 API state:

```ts
Message {
  id: string;
  sessionId: string;
  senderId: string;            // user id 또는 'ai'
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

제안 endpoints:
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
- `POST /messages/{message_id}/copy`는 analytics가 필요할 때만 선택 사항이다. 복사 자체는 client-side로 유지 가능하다.

`backend-v2` coverage:
- 부분적으로 커버됨: `GET /sessions/{session_id}/messages`, `POST /sessions/{session_id}/messages`, `POST /sessions/{session_id}/messages/stream`, `DELETE /sessions/{session_id}/messages`.
- 큰 gap: `SendMessageRequest`는 `{ content }`만 받는다. referenced file ids, client message id, citation contract, normalized frontend message shape, feedback/regenerate endpoint가 없다.
- SSE는 존재하지만 현재 event stream은 raw `MessageOutput`을 `message` event로 보내고 마지막에 `done`을 보낸다. 위 제품 레벨 event taxonomy는 아직 없다.

### 1.6 Files as ground truth

현재 보이는 동작:
- Files page는 two-pane project file browser다.
- Folder rail은 file paths에서 계산된다.
- Search는 visible files를 필터링한다.
- Upload dialog는 selected folder 아래에 mock file을 만든다.
- Query가 맞지 않으면 empty state가 나타난다.
- Selected files는 session ground truth로 pin할 수 있다.
- File type은 icon과 visual anatomy를 제어한다: pdf/sheet/doc/image/folder.
- Session side panel과 artifacts는 files를 id/name으로 cite한다.

필요한 API state:

```ts
FileAsset {
  id: string;             // stable backend id 또는 stable project-relative path
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
  documentId?: string;    // knowledge/index document와 분리되어 있다면 link
}
```

제안 endpoints:
- `GET /projects/{project_id}/files?prefix=&recursive=&q=&include=summary,index_status`
- `POST /projects/{project_id}/files` multipart with fields `path`, `file`, optional `folder`
- `POST /projects/{project_id}/folders { path }` for empty folders
- `GET /projects/{project_id}/files/{path}` download
- `PATCH /projects/{project_id}/files/{path} { name?, summary?, ground_truth? }`
- `DELETE /projects/{project_id}/files/{path}`
- `POST /projects/{project_id}/files/index { paths: string[] }`
- `GET /projects/{project_id}/files/{path}/index-status`

`backend-v2` coverage:
- dirents로 부분 커버됨: upload/list/get/delete with `path`, `kind`, `bytes`, `modified_at`.
- 프론트엔드 기준 부족한 점: path와 분리된 stable `id`, type/mime summary, ground-truth extraction summary, index status, empty folder creation, file rename/move, 명시적인 project-file-to-document indexing status.
- 기존 `/documents`는 그대로 충분하지 않다. project dirents와 분리되어 있고 `router.rs`상 project-scoped/auth-layered처럼 보이지 않는다.

### 1.7 Artifacts

현재 보이는 동작:
- Session Artifact button은 `team_decision_record` artifact를 생성한다.
- Artifact는 status, sections, evidence file ids, next actions를 가진다.
- Artifact는 session side panel에 붙는다.

필요한 API state:

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

제안 endpoints:
- `POST /sessions/{session_id}/artifacts { kind, file_ids, instruction? }`
- `GET /sessions/{session_id}/artifacts`
- `GET /artifacts/{artifact_id}`
- `PATCH /artifacts/{artifact_id} { title?, sections?, status? }`
- `DELETE /artifacts/{artifact_id}`
- `POST /artifacts/{artifact_id}/export { format: 'markdown' | 'pdf' | 'docx' }`

`backend-v2` coverage:
- 커버되지 않음. artifact table/model/routes 없음.

### 1.8 Skills

현재 보이는 동작:
- Skills tab은 project skills를 `📖` reference 또는 `📖▶` runnable mode로 보여준다.
- Skill card는 name, description, when-to-use, tool bindings, default intent, author, updated time을 보여준다.
- Owner는 create, edit, delete 가능하다.
- Mention copy는 `@skill-name` 또는 clipboard fallback notice를 만든다.
- Runnable skill은 새 session, user prompt message, AI result message를 만든다.

필요한 API state:

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

제안 endpoints:
- `GET /projects/{project_id}/skills`
- `POST /projects/{project_id}/skills { name, description, when_to_use, body, runnable, prompt_template?, tool_bindings?, default_intent? }`
- `GET /skills/{skill_id}`
- `PATCH /skills/{skill_id}`
- `DELETE /skills/{skill_id}`
- `POST /skills/{skill_id}/run { project_id, reference_file_ids?, result: { kind: 'new_session' | 'append_to_session', session_id? } }`
- `POST /sessions/{session_id}/skills { message_range, name?, runnable? }` — session moment를 skill로 lift할 때 필요

`backend-v2` coverage:
- 커버되지 않음. skills model/routes/storage/executor boundary 없음.

### 1.9 Schedule

현재 보이는 동작:
- Schedule tab은 project schedules를 보여준다.
- Owner는 create/edit/delete/pause/resume 가능하다.
- Schedule은 daily/weekly/monthly cron-like settings를 지원한다.
- Trigger는 runnable skill 또는 free prompt가 될 수 있다.
- Result target은 new session each time, append to existing session, activity feed only 중 하나다.
- Notify users를 선택할 수 있다.
- `Run now`는 즉시 session/message 또는 activity feed row를 만든다.

필요한 API state:

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

제안 endpoints:
- `GET /projects/{project_id}/schedules`
- `POST /projects/{project_id}/schedules`
- `GET /schedules/{schedule_id}`
- `PATCH /schedules/{schedule_id}`
- `DELETE /schedules/{schedule_id}`
- `POST /schedules/{schedule_id}/pause`
- `POST /schedules/{schedule_id}/resume`
- `POST /schedules/{schedule_id}/run-now`
- `GET /schedules/{schedule_id}/runs`

`backend-v2` coverage:
- 커버되지 않음. schedules, runs, background worker, next-run calculation, notification targets, activity feed integration 없음.

### 1.10 Activity feed, notifications, 화면에 아직 없지만 필요한 session internals

현재 보이는 동작:
- Project home에는 activity rows가 있다.
- Schedule의 activity-feed run은 entry를 추가한다.
- Toast notices는 mutations를 보고한다.

real API가 붙으면 화면에 아직 없어도 필요한 것들:
- run lifecycle status: queued/running/streaming/persisting/failed/succeeded
- message failure state와 retry
- tool call visibility와 audit trail
- citation provenance: file path, chunk/document id, quote/span, confidence
- session concurrency/lock state: backend-v2는 message handlers에서 locked errors를 이미 반환하므로 UI state가 필요하다
- schedules와 mentions에 대한 notification delivery/read state
- user/session별 unread counts
- control별 permission decisions: can edit project, can create skill, can run schedule, can chat, can read only
- optimistic update reconciliation with server ids
- `client_message_id` / mutation ids 기반 idempotency

제안 endpoints:
- `GET /projects/{project_id}/activity?after=&limit=`
- `GET /sessions/{session_id}/runs/{run_id}`
- `GET /sessions/{session_id}/events?after=` 또는 consolidated SSE/WebSocket
- `POST /notifications/read { ids }`
- `GET /notifications`
- `GET /projects/{project_id}/permissions` 또는 bootstrap responses에 `capabilities` 포함

`backend-v2` coverage:
- 매우 제한적이다. message send/stream path에 session lock errors는 존재한다. 하지만 activity, notification, unread, run, frontend permission envelope는 없다.

## 2. 현재 backend-v2 API coverage matrix

| Domain | Frontend 필요 | backend-v2 coverage | Fit |
|---|---|---|---:|
| Auth | login/signup/current user | `POST /auth/signup`, `POST /auth/login`, `GET/PATCH /me` | Medium |
| User profile | display name/email/avatar/color/team role | `UserResponse`는 username/display_name/role/is_active만 있음 | Low |
| Projects | list/create/get/update/delete | `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}` | Medium-high |
| Members | list/add/remove, role display | `GET/POST /projects/{id}/members`, `DELETE /projects/{id}/members/{user_id}` | Medium |
| Sessions | list/create/get/share/delete | routes 존재 | metadata가 너무 얇아서 Low-medium |
| Session messages | history/send/stream/clear | routes 존재 | raw agent chat은 Medium, product UI contract는 Low |
| Project files | upload/list/download/delete | dirent routes 존재 | file storage는 Medium, ground-truth metadata/indexing은 Low |
| Knowledge documents | project file indexing/corpus | `/documents` 존재 | app project files와 scope/auth가 맞지 않아 Low |
| Artifacts | generate/list/edit/export evidence-backed artifact | 없음 | None |
| Skills | CRUD/run/lift from session | 없음 | None |
| Schedules | CRUD/run/pause/activity targets | 없음 | None |
| Activity feed | project timeline, schedule output | 없음 | None |
| Notifications/unread | per-user state | 없음 | None |
| Bootstrap/BFF | one app load payload | 없음 | None |

## 3. Backend API 작업 우선순위

### P0 — 현재 app을 real backend에 붙여 사용할 수 있게 만드는 최소 조건

#### P0.1 App bootstrap 또는 frontend BFF response 추가

이유: 현재 frontend는 render 전에 전체 `BootstrapPayload`를 로드한다. aggregation 없이 구현하면 앱이 여러 waterfall requests를 수행해야 하고, 누락된 metadata를 client-side에서 합성해야 한다.

제안:

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

BFF를 만들지 않기로 한다면 canonical startup call sequence를 정의하고, 모든 list endpoint가 `updated_since`를 지원하게 해서 반복 heavy load를 피해야 한다.

#### P0.2 Session metadata contract 확장

Backend change:
- sessions에 `title`, `intent`, `model`, `artifact_id?`, `is_auto_append?` columns 또는 side table 추가.
- `session_references(session_id, file_id/path, added_by, added_at)` 추가.
- create/update payload fields와 response 확장.

최소 request:

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

최소 response: section 1.4의 `Session` shape.

#### P0.3 Message send/history/stream을 UI용으로 normalize

Backend change:
- `referenced_file_ids`와 `client_message_id`를 받는다.
- role/body/status/citations를 가진 normalized user/assistant messages를 persist한다.
- raw agent outputs만이 아니라 product-level events를 반환하거나 stream한다.

최소 request:

```json
POST /sessions/{session_id}/messages
{
  "content": "Summarize the selected evidence.",
  "referenced_file_ids": ["file-market"],
  "client_message_id": "uuid-from-client"
}
```

최소 response:

```json
{
  "userMessage": { "id": "...", "role": "user", "body": "...", "citations": ["file-market"] },
  "assistantMessage": { "id": "...", "role": "assistant", "body": "...", "citations": [{ "fileId": "file-market" }] },
  "runId": "..."
}
```

#### P0.4 Project file metadata + session references

Backend change:
- dirents는 storage layer로 유지하되 file metadata/index layer를 추가한다.
- Project files를 stable id 또는 path로 일관되게 addressable하게 만든다.
- App이 필요한 summary/index status를 노출한다.

최소 endpoints:
- `GET /projects/{project_id}/files`
- `POST /projects/{project_id}/files` multipart
- `POST /projects/{project_id}/folders`
- `PUT /sessions/{session_id}/references`

#### P0.5 Permission envelope

모든 project/session response는 UI affordances를 추측하지 않도록 충분한 permission flags를 포함해야 한다.

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

### P1 — 제품의 핵심 차별 기능을 실제화

#### P1.1 Artifacts API

`Artifact` button과 evidence-backed outputs에 필요하다. artifact table, generation route, list/get/update/export를 추가한다.

#### P1.2 Skills CRUD + run API

Team-owned reusable capability에 필요하다. project skills table, owner/member permission rules, runnable executor integration을 추가한다.

#### P1.3 Schedule CRUD + run engine

Automatic session/activity generation에 필요하다. schedule table, schedule_runs table, pause/resume/run-now, result-target handling, worker ownership, failure reporting을 추가한다.

#### P1.4 Activity feed

Project home과 schedule `activity_feed_only` target에 필요하다.

#### P1.5 Regenerate/feedback APIs

AI message controls에 이미 `Regenerate`와 `Good`이 보이므로 필요하다. Copy는 analytics가 필요하지 않으면 local로 유지해도 된다.

### P2 — scale, polish, collaboration state 개선

- projects/sessions/files/messages 검색/필터 endpoint
- user/session별 unread/read receipts
- notification inbox와 schedule notifications
- 제품 방향상 필요하다면 message edit/delete/threading
- artifact export formats와 version history
- project-level mutations audit log
- file rename/move와 folder tree mutations

## 4. Backend handoff checklist

Backend 개발자는 아래 구현 slice부터 시작할 수 있다.

1. **Session metadata migration**
   - sessions에 `title`, `intent`, `model`, `artifact_id`, `is_auto_append` 추가.
   - `session_references` table 추가.
   - `CreateSessionRequest`, `UpdateSessionRequest`, `SessionResponse` 업데이트.

2. **Normalized message contract**
   - raw `ailoy::message::Message`와 분리된 message DTO 추가.
   - `role`, `sender_id`, `body`, `status`, `citations`, `client_message_id`, `run_id` persist.
   - 필요하면 raw agent output은 별도로 저장.

3. **Project files metadata/index bridge**
   - dirent upload을 storage layer로 취급.
   - project file metadata와 optional document/index id link 추가.
   - `/documents`를 project-scope로 만들거나 `/projects/{project_id}/files/index`로 대체.

4. **Bootstrap/BFF**
   - `GET /app/bootstrap`을 추가하거나 canonical startup call sequence 정의.
   - permissions와 summary stats 포함.

5. **Artifacts**
   - artifact routes와 evidence schema 추가.

6. **Skills**
   - project skills CRUD와 run behavior 추가.

7. **Schedules + activity feed**
   - schedules, schedule runs, activity feed entries, run-now route 추가.

## 5. 현재 검증 근거

Feature split cleanup 이후 이미 실행한 commands:

```bash
pnpm -C app lint
pnpm -C app build
pnpm -C app test:e2e
```

결과:
- TypeScript lint/typecheck: PASS
- Production build: PASS
- Playwright e2e: PASS, 20/20 tests
- Manual Chrome/Playwright interaction audit: PASS, 8/8 scenario groups, 0 console issues
- Mobile first page: PASS, no horizontal overflow

Visual smoke run 중 screenshots는 `/tmp/cowork-feature-split-*.png` 아래 저장되었다. durable structured audit는 `app/docs/interaction-audit.json`에 있다.

## 6. 이 보고서의 known limits

- Destructive delete controls는 full interaction audit에서 클릭하지 않았다. 대신 code paths를 확인했고 e2e suite는 create/run flows를 커버한다.
- `backend-v2`는 source routes/models/migrations를 기준으로 분석했다. seeded data를 가진 live backend server를 띄워 확인한 것은 아니다.
- 제안 API names는 의도적으로 구체적이지만 최종 protocol law는 아니다. 중요한 계약은 shape, ownership, permission, event semantics다.
