# Cowork App Mock

React/Vite mock frontend for Cowork for Teams.

이 앱은 `agent-k.zip` HTML과 기존 `wireframe/` 동작을 **레퍼런스로 분석해서 다시 구현한** mock app입니다. 레퍼런스 HTML을 런타임으로 그대로 쓰지 않습니다. 런타임 진입점은 `index.html -> /src/main.tsx -> src/App.tsx`입니다.

## Runtime surface

- `src/App.tsx` contains the visible React app: Projects, Project Home, Files, Session, Skills, Schedule, Members, Settings, Auth mock, and Presenter demo.
- `src/data/seed.ts` contains the data-rich mock project/session/file/artifact/skill/schedule state.
- `src/services/mockApi.ts` exposes async mock API methods shaped for later `backend-v2` wiring.
- `src/services/coworkApi.ts` keeps the future typed API boundary separate from view code.
- `src/styles/cowork-design-system.css` is copied from the provided Design System foundation and imported by `src/styles/globals.css`.
- `src/components/Icon.tsx` uses inline SVG paths copied from the Design System `preview/_icons.js`; the earlier PNG icon sheets are reference material only and are not used at runtime.
- `src/reference-evidence/*.png` stores captured screenshots from `agent-k.zip` and `wireframe/` used as implementation references only.

## Design-system constraints applied

- Pretendard + JetBrains Mono typography.
- Paper-warm background, warm ink, slate-teal accent, hairline borders.
- Exact 200px app sidebar, restrained cards, rare shadows, no glass/blur.
- Korean-first bilingual copy with English product nouns.
- Restrained purposeful motion: page enter, card lift/press, live ping/thinking states.

## Current product slice

- Projects opens first, and every project card opens a usable Project Home.
- New Project, New Session, New Folder, and Upload are self-serve mock actions, not dead CTAs.
- Project Home shows sessions, activity, members, pinned files, and shared-session decisions.
- Files is a two-pane ground-truth browser with folder/search/empty states, file selection, mock upload, and pin-to-session behavior.
- Session view includes transcript, referenced files, access changes, exact composer send, mock AI responses, and mock artifact generation.
- Skills and Schedule are shallow but data-backed so the mockup has usable product states.

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm test:e2e
```

## Backend/API note

No real API calls are made yet. The UI code is intentionally structured around a mock API service plus local mock mutations so that `backend-v2` integration can replace service methods without rewriting page components. Current self-serve flows are covered by Playwright tests.
