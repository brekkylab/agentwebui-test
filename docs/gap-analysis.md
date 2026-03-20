# Server / Client Gap Analysis

Backend(origin/backend)와 Frontend(frontend branch)의 현재 상태를 대조 분석하고, 양쪽 모두 없는 보일러플레이트를 정리한 문서.

---

## 1. 기능 매핑

| 기능 영역 | Backend | Frontend | 갭 |
|-----------|---------|----------|-----|
| Agent 관리 | CRUD API 완비 (`/agents`) | 없음 | Frontend에 Agent 관리 UI 필요 |
| Provider Profile 관리 | CRUD API 완비 (`/provider-profiles`) | 없음 | Frontend에 Provider 관리 UI 필요 |
| Agent Spec | `AgentSpec` 타입 (lm, instruction, tools) | 없음 | Frontend에 Agent 설정 폼 필요 |
| Agent Provider | `AgentProvider` 타입 + 환경변수 부트스트랩 | 없음 | Frontend에서 Provider 선택/설정 연동 필요 |
| 세션 (Chat) | API 있음 (`POST/GET /sessions`, messages, close) | UI 있음 (assistant-ui, 세션 전환) | 양쪽 다 있지만 미연결 |
| 메시지 | `POST /sessions/{id}/messages` | Zustand `addMessage` + assistant-ui | 양쪽 다 있지만 미연결 |
| 문서 (Documents) | 없음 | UI 있음 (업로드, 목록, 삭제, 드래그앤드롭) | Backend에 Document API 필요 |
| Knowledge | 없음 | UI 있음 (카드 그리드, 편집, 문서 체크리스트) | Backend에 Knowledge API 필요 |
| 별도 문서 (Session Docs) | 없음 | UI 있음 (세션 전용 파일 첨부) | Backend에 세션 문서 API 필요 |
| Health Check | `GET /health` | 없음 | Frontend에서 서버 상태 표시 가능 |
| OpenAPI / Swagger | utoipa + Swagger UI (`/swagger-ui/`) | 없음 | Frontend에서 API 자동 생성 활용 가능 |
| 인증/유저 | 없음 | 표시만 (아바타 + "Test User") | 양쪽 모두 미구현 |
| 테마 (Dark/Light) | N/A | 동작함 (next-themes) | Backend 무관 |
| 반응형 | N/A | 동작함 (모바일 사이드바) | Backend 무관 |
| DB 영속성 | SQLite (sqlx) + Repository 패턴 | 없음 (Zustand in-memory) | Frontend → Backend API 연결 시 해결 |
| 퍼블릭 배포 | 없음 | Cloudflare Tunnel (`pnpm dev:public`) | Backend도 동일 방식 가능 |

---

## 2. 누가 뭘 추가해야 하는가

### Backend에 추가 필요

1. Document CRUD API (`/documents` — 파일 업로드/목록/삭제)
2. Knowledge CRUD API (`/knowledges` — 생성/수정/삭제, 문서 연결)
3. Session Document API (세션별 임시 문서 첨부)
4. RAG 연동 (Knowledge + Document → 벡터 검색)

### Frontend에 추가 필요

1. Agent 관리 UI (목록, 생성/수정/삭제 폼)
2. Provider Profile 관리 UI (API 키 설정, 기본 프로필 선택)
3. 세션 생성 시 Agent 선택 연동
4. Backend API 클라이언트 (fetch wrapper 또는 API SDK)

### 양쪽 통합 필요

1. 세션/메시지 — Frontend의 Zustand → Backend API 호출로 교체
2. 인증 — 양쪽 모두 미구현, 동시에 설계 필요
3. CORS 설정 — Backend에서 Frontend origin 허용

---

## 3. 양쪽 모두 없는 보일러플레이트

### 인프라/통합

| 항목 | 설명 |
|------|------|
| CORS 설정 | Backend가 Frontend origin을 허용해야 API 호출 가능 |
| API 클라이언트 | Frontend에서 Backend를 호출하는 fetch wrapper / SDK |
| 환경 변수 관리 | Frontend `.env.local` (API URL 등), 공유 설정 체계 |
| Docker / docker-compose | Backend + Frontend를 함께 띄우는 컨테이너 설정 |

### 보안

| 항목 | 설명 |
|------|------|
| 인증/인가 | 유저 로그인, 세션 토큰, API 보호 |
| Rate Limiting | API 남용 방지 |
| Security Headers | CSP, X-Frame-Options 등 |
| Input Sanitization | Backend 입력 검증 강화, Frontend 폼 검증 |

### 품질/개발 경험

| 항목 | 설명 |
|------|------|
| Frontend 테스트 | vitest + testing-library 등. Backend는 테스트 있으나 Frontend은 없음 |
| CI/CD | GitHub Actions — lint, test, build 자동화 |
| Pre-commit hooks | lint-staged, rustfmt/clippy 자동 실행 |
| Global Error Boundary | Frontend의 전역 에러 처리 (React Error Boundary) |

### 실시간/파일 처리

| 항목 | 설명 |
|------|------|
| SSE / WebSocket | AI 응답 스트리밍. 현재 더미 응답이지만 실제 연동 시 필수 |
| 파일 저장소 | 문서 업로드의 실제 저장 (로컬 디스크, S3 등). 현재 메타데이터만 저장 |
| DB 마이그레이션 | Backend에 sqlx 있지만 마이그레이션 도구/스크립트가 없음 |

### 운영

| 항목 | 설명 |
|------|------|
| 로깅 | Backend는 println만, Frontend는 없음. 구조화된 로깅 필요 |
| 모니터링/메트릭 | `/health`는 있지만 메트릭(응답시간, 에러율 등)은 없음 |
| Monorepo 설정 | 루트에 workspace 설정 (backend + frontend 통합 관리) |

---

## 4. 전체 우선순위 (급한 것 순서)

통합을 시작하고, 점차 프로덕션으로 발전시키는 순서.

### Tier 1 — 통합 시작의 전제 조건 (이것 없으면 연결 자체가 불가)

| # | 항목 | 이유 |
|---|------|------|
| 1 | **CORS 설정** | Frontend에서 Backend API를 호출하려면 반드시 필요 |
| 2 | **API 클라이언트 + .env** | Backend URL을 Frontend에서 관리하고 호출하는 기반 |
| 3 | **세션/메시지 통합** | 가장 핵심적인 기능. Zustand → Backend API 교체 |

### Tier 2 — 기능 완성 (한쪽에만 있는 것을 양쪽에 구축)

| # | 항목 | 이유 |
|---|------|------|
| 4 | **Document API (Backend)** | Frontend UI는 있지만 Backend 저장이 없음 |
| 5 | **Knowledge API (Backend)** | Frontend UI는 있지만 Backend 저장이 없음 |
| 6 | **파일 저장소** | Document 업로드의 실제 파일 저장 (로컬/S3) |
| 7 | **Agent 관리 UI (Frontend)** | Backend API는 있지만 Frontend UI가 없음 |
| 8 | **Provider Profile UI (Frontend)** | Backend API는 있지만 Frontend UI가 없음 |
| 9 | **DB 마이그레이션** | 스키마 변경이 빈번해지면 즉시 필요 |

### Tier 3 — 퍼블릭 배포 전 필수

| # | 항목 | 이유 |
|---|------|------|
| 10 | **인증/인가** | 외부 노출 시 보안 필수 |
| 11 | **SSE / WebSocket** | 실제 AI 응답 스트리밍에 필수 |
| 12 | **Security Headers** | 프로덕션 보안 기본 |
| 13 | **Rate Limiting** | API 남용 방지 |
| 14 | **Global Error Boundary** | 사용자 경험 보호 |
| 15 | **Input Sanitization** | 프로덕션 보안 |

### Tier 4 — 개발 품질/운영 (프로덕션 안정화)

| # | 항목 | 이유 |
|---|------|------|
| 16 | **Frontend 테스트** | 회귀 방지 |
| 17 | **CI/CD** | 자동화된 빌드/테스트/배포 |
| 18 | **Pre-commit hooks** | 코드 품질 게이트 |
| 19 | **로깅** | 디버깅, 운영 모니터링 |
| 20 | **Docker / docker-compose** | 배포 환경 일관성 |
| 21 | **모니터링/메트릭** | 운영 가시성 |
| 22 | **Monorepo 설정** | 선택적, 프로젝트 규모에 따라 |
