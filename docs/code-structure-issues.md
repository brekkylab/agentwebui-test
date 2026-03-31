# Code Structure Issues

> 2026-03-30 기준 코드베이스 구조 분석 결과.
> 2026-03-31 해결 상태 업데이트.

---

## 해결 완료

### E. ~~서비스 레이어 부재 — Handler 비대~~ ✅

`services/session.rs`, `services/speedwagon.rs` 도입. handlers.rs에서 -345줄. 핸들러는 요청 파싱 → 서비스 호출 → 응답 변환만 담당.

### F. ~~Session 업데이트 비원자성~~ ✅

`update_session_atomic()` 도입. SQLite 트랜잭션으로 title/provider/speedwagons/sources 원자적 업데이트. 기존 개별 메서드 제거.

### K. ~~동일 데이터 중복 fetch~~ ✅

Zustand 스토어에 speedwagons/sources 캐시 슬라이스 + Promise dedup 도입. 5개 컴포넌트의 독립 fetch → 글로벌 캐시 구독으로 통합. `speedwagonListVersion` 범프 메커니즘 제거.
> 캐시 대상 리소스가 4개 이상으로 늘어나면 SWR 도입 재검토 (→ `docs/api-design-issues.md`)

### G. ~~N+1 쿼리 — list_speedwagons~~ ✅

`speedwagon_sources` 전체를 1회 조회 → `HashMap<speedwagon_id, [source_id]>` 매핑. 쿼리 N+1 → 2회 고정.

### B. ~~SubAgentProvider 생성 로직 중복~~ ✅

free function `extract_sub_agent_provider()` → `SubAgentProvider::from_provider()` 메서드로 이동.

### A. ~~KB 설정 파일 로딩 dead code~~ ✅

`load_kb_config_from_file()`, `resolve_path()`, `KNOWLEDGE_AGENTS_CONFIG` 상수 제거. `ChatAgent::new()`는 Backend DB에서 `KbEntry`를 직접 전달받음.

### C. ~~error_value() 헬퍼 3중 중복~~ ✅

`tools.rs`/`dispatch.rs`의 중복 정의 → `lib.rs`의 `pub(crate) error_value()` 통합. `invalid_arguments_value()` → `error_value("invalid_arguments")` 대체.

### D. ~~도구(Tool) 등록 분산~~ ✅

`ensure_default_tool_names()` 제거. `build_tool_set()`가 `(Vec<String>, ToolSet)` 반환하여 이름/런타임 단일 소스. 새 도구 추가 관례는 `tools.rs` 모듈 주석에 문서화.

### L. ~~미사용 ChatSession 타입~~ ✅

`ChatSession`, `ChatMessage`, `SessionSource` 인터페이스 삭제.

### J. ~~creatingRef 리셋 누락~~ ✅

`try/catch/finally` 패턴으로 변경하여 성공/실패 양쪽에서 리셋 보장.

### M. ~~에러 처리 패턴 불일치~~ ✅

sonner toast 도입. 8개 컴포넌트의 `console.warn`/`catch(()=>{})`를 `toast.error()`로 통일. best-effort 자동 작업은 기존 패턴 유지.

### I. ~~메시지 전송마다 전체 세션 리로드~~ ✅

`add_session_message` 반환 타입을 `Option<Session>` → `Option<SessionMessage>`로 변경. INSERT 시점 데이터로 직접 구성, 전체 리로드 제거.

### Backend → knowledge-agent 직접 의존 제거 ✅

`chat-agent/src/speedwagon/indexing.rs` 래퍼 도입. Backend는 `chat_agent::speedwagon::indexing::build_index()`만 호출. `knowledge-agent`는 `chat-agent`의 구현 세부사항으로 격리.

---

## 미해결

### H. [Low] 페이지네이션 없음

**위치**: `backend/src/handlers.rs` — `list_sessions`, `list_sources`, `list_speedwagons`

모든 리스트 API가 전건 조회. Frontend에 페이지네이션 UI가 없으므로 실제 필요 시점까지 보류.

**수정 시점**: 목록 데이터가 수백 건 이상 쌓여서 UX에 영향을 줄 때.

---

## 추가 발견 이슈 → `docs/api-design-issues.md`

API 설계 분석에서 11개 이슈를 별도 문서로 분리:
- `AddSessionMessageRequest.role` 과도한 입력 허용 (보안)
- Source 삭제 로직 핸들러 직접 위치
- `updateSessionTitle` / `updateSession` Frontend 중복
- TOCTOU 레이스 컨디션
- Session 도메인 모델 직접 응답 반환 등
