# Frontend Mockup Design Spec

AI 에이전트 Web UI의 인터랙티브 목업 페이지 설계 문서.

## Overview

사용자가 문서를 업로드하고, Knowledge 그룹으로 묶고, 선택한 Knowledge 기반으로 AI 에이전트와 채팅하는 웹 애플리케이션의 목업. 백엔드 연결 없이 로컬 상태(메모리)로 동작하며, 브라우저 새로고침 시 더미 데이터로 초기화.

## Target Users

- 1차: 개발팀 (내부 테스트)
- 2차: 일반 사용자 (사용성 테스트)

## Tech Stack

- **Framework**: Next.js + TypeScript
- **Package Manager**: pnpm
- **Chat UI**: assistant-ui
- **Component Library**: shadcn/ui
- **Styling**: Tailwind CSS
- **Reference**: [ailoy-web-ui](https://github.com/brekkylab/ailoy-web-ui)

## Layout

왼쪽 사이드바 + 오른쪽 메인 콘텐츠 영역.

### Sidebar (왼쪽 고정)

- **상단**: 앱 이름 `agentwebui-test`
- **메뉴**:
  - Chat (▼ 클릭 시 세션 드롭다운)
  - Documents
  - Knowledge
- **하단**:
  - 라이트/다크 모드 토글 (실제 동작)
  - 유저 아바타 + 이름 (표시만)
- **반응형**: 좁은 화면에서 접힘 (햄버거 메뉴로 토글)

### Main Content Area (오른쪽)

사이드바 메뉴 선택에 따라 화면 전환.

## Screens

### 1. Documents 탭

문서 업로드 및 관리 화면.

**문서 목록:**
- 각 문서: 파일명, 크기, 업로드일 표시
- 아코디언: 문서 클릭 시 아래로 펼쳐져서 소속 Knowledge 배지 + 삭제 버튼 표시. 다시 클릭하면 접힘

**문서 업로드:**
- "+ 문서 추가" 버튼 클릭 → 파일 선택 다이얼로그
- 파일 드래그 시 전체 영역에 "여기에 놓으세요" 오버레이 표시
- 두 가지 방식 모두 지원

**인터랙티브 동작:**
- 문서 추가/삭제가 로컬 상태로 동작
- 새로고침 시 더미 데이터로 초기화

### 2. Knowledge 탭

Knowledge 그룹 생성 및 관리 화면. 플레이리스트 방식.

**기본 상태 (목록):**
- Knowledge 카드 그리드 레이아웃
- 각 카드: 이름 + 설명 + 포함된 문서 수
- "+ 새로 만들기" 버튼

**편집 상태 (카드 클릭 시 페이지 전환):**
- 상단: "← Knowledge 목록" 뒤로가기 + 우측에 "삭제" 버튼 (확인 다이얼로그 후 삭제)
- 왼쪽: 전체 문서 체크리스트 (체크/해제로 문서 추가/제거)
- 오른쪽: Knowledge 상세
  - 이름 (인라인 편집 가능)
  - 설명 (인라인 편집 가능)
  - 포함된 문서 목록 (체크리스트와 실시간 연동)

**"+ 새로 만들기" 흐름:**
- 이름과 설명 입력 폼 → 생성 후 바로 편집 상태로 진입

**인터랙티브 동작:**
- Knowledge 생성/삭제, 문서 연결/해제가 로컬 상태로 동작
- 하나의 문서가 여러 Knowledge에 중복 소속 가능

### 3. Chat 탭

AI 에이전트 채팅 화면. assistant-ui 기반.

**새 세션 (빈 상태):**
- claude.ai 스타일 빈 채팅 화면
- 중앙에 앱 이름 + Knowledge 활성화 힌트 문구
- 좌상단 [📚] 플로팅 버튼

**채팅 화면:**
- 메시지 입력창 + 전송 버튼
- 채팅 메시지 목록 (유저/어시스턴트)
- 더미 응답 반환 (로컬 상태). 예: "선택하신 Knowledge를 기반으로 검색했습니다. [문서명]에서 관련 내용을 찾았습니다." 형태의 고정 문구

**Knowledge 패널 (플로팅 버튼 클릭 시):**
- "전체 문서 사용" 체크박스 (전체 선택/해제 토글)
- Knowledge 체크리스트 (멀티 선택 가능)
- "+ 별도 문서 포함" 버튼 → 파일 선택 다이얼로그 → 세션 전용 임시 문서 추가 (Documents 탭에는 나타나지 않음, 해당 세션 내에서만 유효)
- "최소화" 클릭 시 플로팅 버튼으로 축소

**세션 관리:**
- 사이드바 "Chat" 클릭 → 새 세션 생성
- "Chat" 옆 ▼ 클릭 → 이전 세션 목록 드롭다운
- 각 세션 항목: 세션 제목 (첫 메시지 요약) 만 표시
- 세션이 많을 경우 드롭다운 내 스크롤로 처리

## Theme

- **기본**: 라이트 모드
- **다크 모드**: 토글로 전환 가능 (실제 동작)
- 사이드바 하단의 토글 버튼으로 전환

## Responsive

- **데스크탑**: 사이드바 항상 표시
- **좁은 화면**: 사이드바 접힘, 햄버거 메뉴로 토글

## Data Model (로컬 상태)

```typescript
interface Document {
  id: string;
  name: string;
  size: number; // bytes
  uploadedAt: Date;
}

interface Knowledge {
  id: string;
  name: string;
  description: string;
  documentIds: string[]; // 문서 ID 목록, 중복 소속 가능
}

interface SessionDocument {
  name: string;
  size: number;
}

interface ChatSession {
  id: string;
  title: string; // 첫 메시지 요약
  messages: ChatMessage[];
  knowledgeIds: string[]; // 선택된 Knowledge
  sessionDocuments: SessionDocument[]; // 세션 전용 임시 문서 (Documents 탭에 나타나지 않음)
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}
```

## Dummy Data (초기 상태)

앱 로드 시 아래 더미 데이터로 초기화:

- **Documents**: 시장분석.pdf, 경쟁사.docx, API스펙.pdf, 전략.pdf, 법률검토.pdf
- **Knowledge**: 마케팅 자료 (3개 문서), 기술 문서 (2개 문서), 법률 검토 (1개 문서)
- **Chat Sessions**: 빈 상태 (새 세션으로 시작)

## Backend API Mapping (향후 연결 참고)

목업의 로컬 상태가 향후 backend API와 매핑되는 구조:

| 목업 기능 | Backend API |
|----------|-------------|
| 문서 업로드/삭제 | 현재 미구현 (향후 추가) |
| Knowledge CRUD | 현재 미구현 (향후 추가) |
| 세션 생성 | `POST /sessions` |
| 메시지 추가 | `POST /sessions/{id}/messages` |
| 세션 목록 | `GET /sessions` |
| Agent 선택 | `GET /agents`, `POST /agents` |
| Provider 설정 | `GET /provider-profiles` |

Note: 문서 업로드와 Knowledge 관리는 현재 백엔드에 없으며, 목업을 기반으로 향후 API를 설계할 예정.

## Out of Scope (목업 단계)

- 실제 백엔드 연결
- 실제 AI 응답 (더미 응답만)
- 채팅 중 Knowledge 선택 변경의 실제 동작 (UI만 동작)
- 유저 인증/로그인
- Settings 페이지
- Agent/Provider 선택 UI
