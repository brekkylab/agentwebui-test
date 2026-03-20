# agentwebui-test Frontend

AI 에이전트 Web UI 목업 페이지. 문서 업로드, Knowledge 그룹화, AI 에이전트 채팅을 체험할 수 있는 인터랙티브 목업.

## Tech Stack

- Next.js 15 + TypeScript
- assistant-ui (chat primitives)
- shadcn/ui + Tailwind CSS
- Zustand (local state)

## Getting Started

```bash
pnpm install
pnpm dev
```

http://localhost:3000 에서 확인.

## Public URL (Cloudflare Tunnel)

로컬 서버를 퍼블릭 URL로 노출하여 외부에서 접속 가능하게 합니다. 사용성 테스트 시 유용합니다.

### 사전 준비

```bash
brew install cloudflared
```

### 실행

```bash
pnpm dev:public
```

터미널에 표시되는 `https://xxx.trycloudflare.com` URL로 인터넷 어디서든 접속 가능합니다.

- Cloudflare 계정 불필요 (무료)
- 매 실행마다 새 URL이 생성됨
- Ctrl+C로 종료

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | 로컬 개발 서버 (http://localhost:3000) |
| `pnpm dev:public` | 개발 서버 + Cloudflare Tunnel (퍼블릭 URL) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm start` | 프로덕션 서버 |
| `pnpm lint` | ESLint |

## Pages

| Path | Description |
|------|-------------|
| `/chat` | AI 에이전트 채팅 (세션별 히스토리, Knowledge 선택) |
| `/documents` | 문서 업로드/관리 (드래그앤드롭, 아코디언) |
| `/knowledge` | Knowledge 그룹 생성/편집 (플레이리스트 방식) |

## Notes

- 모든 데이터는 브라우저 메모리(Zustand)에 저장되며, 새로고침 시 더미 데이터로 초기화됩니다.
- 백엔드 연결 없이 동작하는 목업입니다. 채팅 응답은 더미 텍스트입니다.
