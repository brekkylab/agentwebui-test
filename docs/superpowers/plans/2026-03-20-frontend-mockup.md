# Frontend Mockup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 에이전트 Web UI의 인터랙티브 목업을 Next.js로 구현한다. 백엔드 없이 로컬 상태로 동작하며, Documents/Knowledge/Chat 3탭 구조.

**Architecture:** Next.js App Router + Zustand 로컬 상태 관리. shadcn/ui 컴포넌트 라이브러리 위에 Documents(업로드/관리), Knowledge(플레이리스트 방식 그룹화), Chat(assistant-ui 기반 채팅) 3개 탭을 구성. 더미 데이터로 초기화되며 브라우저 새로고침 시 리셋.

**Tech Stack:** Next.js 15, TypeScript, pnpm, assistant-ui (^0.11.39), shadcn/ui, Tailwind CSS, Zustand, Radix UI

**Spec:** `docs/superpowers/specs/2026-03-20-frontend-mockup-design.md`

**Reference:** [ailoy-web-ui](https://github.com/brekkylab/ailoy-web-ui) — assistant-ui 사용 패턴 참고

---

## File Structure

```
frontend/
├── app/
│   ├── layout.tsx              # Root layout (ThemeProvider, Sidebar 포함)
│   ├── page.tsx                # / → /chat redirect
│   ├── globals.css             # Tailwind imports + global styles
│   ├── chat/
│   │   └── page.tsx            # Chat 탭 페이지
│   ├── documents/
│   │   └── page.tsx            # Documents 탭 페이지
│   └── knowledge/
│       └── page.tsx            # Knowledge 탭 페이지
├── components/
│   ├── ui/                     # shadcn/ui 컴포넌트 (Button, Card, Checkbox 등)
│   ├── assistant-ui/
│   │   └── thread.tsx          # assistant-ui Primitive 래퍼 (Thread, Composer, UserMessage, AssistantMessage)
│   ├── layout/
│   │   ├── sidebar.tsx         # 사이드바 (네비게이션 + 유저 + 테마토글)
│   │   └── mobile-sidebar.tsx  # 모바일 햄버거 메뉴 + Sheet
│   ├── documents/
│   │   ├── document-list.tsx   # 문서 목록 (아코디언 포함)
│   │   └── upload-zone.tsx     # 드래그앤드롭 + 버튼 업로드
│   ├── knowledge/
│   │   ├── knowledge-grid.tsx  # Knowledge 카드 그리드 (기본 상태)
│   │   └── knowledge-editor.tsx# Knowledge 편집 (체크리스트 + 상세)
│   └── chat/
│       ├── chat-view.tsx       # 채팅 메인 뷰 (빈 상태 + 대화)
│       ├── knowledge-panel.tsx # 플로팅 Knowledge 선택 패널
│       └── session-dropdown.tsx# 세션 목록 드롭다운
├── lib/
│   ├── store.ts                # Zustand 스토어 (전체 앱 상태)
│   ├── types.ts                # TypeScript 인터페이스
│   ├── dummy-data.ts           # 초기 더미 데이터
│   └── utils.ts                # cn() 등 유틸리티
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── tailwind.config.ts
└── components.json             # shadcn/ui 설정
```

---

## Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/next.config.ts`
- Create: `frontend/postcss.config.mjs`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/components.json`
- Create: `frontend/app/globals.css`
- Create: `frontend/app/layout.tsx`
- Create: `frontend/app/page.tsx`
- Create: `frontend/lib/utils.ts`

- [ ] **Step 1: Next.js 프로젝트 생성**

```bash
cd /Users/jeffrey/workspace/agentwebui-test
pnpm create next-app@15 frontend --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --turbopack
```

Expected: `frontend/` 디렉토리에 Next.js 프로젝트가 생성됨

- [ ] **Step 2: 추가 의존성 설치**

```bash
cd frontend
pnpm add zustand @assistant-ui/react@^0.11.39 @assistant-ui/react-markdown@^0.11.39
pnpm add @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-dropdown-menu @radix-ui/react-dialog @radix-ui/react-separator @radix-ui/react-slot @radix-ui/react-tooltip
pnpm add class-variance-authority clsx tailwind-merge lucide-react next-themes
```

- [ ] **Step 3: shadcn/ui 초기화**

```bash
cd frontend
pnpm dlx shadcn@latest init
```

설정값:
- Style: Default
- Base color: Neutral
- CSS variables: Yes

- [ ] **Step 4: 필요한 shadcn/ui 컴포넌트 추가**

```bash
cd frontend
pnpm dlx shadcn@latest add button card checkbox input textarea separator sheet tooltip dropdown-menu avatar badge dialog
```

- [ ] **Step 5: 개발 서버 실행 확인**

```bash
cd frontend
pnpm dev
```

Expected: http://localhost:3000 에서 Next.js 기본 페이지가 뜸

- [ ] **Step 6: 커밋**

```bash
cd /Users/jeffrey/workspace/agentwebui-test
git add frontend/
git commit -m "feat: scaffold Next.js project with shadcn/ui and dependencies"
```

---

## Task 2: 타입 정의 + 더미 데이터 + Zustand 스토어

**Files:**
- Create: `frontend/lib/types.ts`
- Create: `frontend/lib/dummy-data.ts`
- Create: `frontend/lib/store.ts`

- [ ] **Step 1: 타입 정의 작성**

```typescript
// frontend/lib/types.ts
export interface Document {
  id: string;
  name: string;
  size: number; // bytes
  uploadedAt: Date;
}

export interface Knowledge {
  id: string;
  name: string;
  description: string;
  documentIds: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export interface SessionDocument {
  name: string;
  size: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  knowledgeIds: string[];
  sessionDocuments: SessionDocument[]; // 세션 전용 임시 문서 (Documents 탭에 나타나지 않음)
}
```

- [ ] **Step 2: 더미 데이터 작성**

```typescript
// frontend/lib/dummy-data.ts
import { Document, Knowledge, ChatSession } from "./types";

export const DUMMY_DOCUMENTS: Document[] = [
  { id: "doc-1", name: "시장분석.pdf", size: 2457600, uploadedAt: new Date("2026-03-15") },
  { id: "doc-2", name: "경쟁사.docx", size: 1126400, uploadedAt: new Date("2026-03-14") },
  { id: "doc-3", name: "API스펙.pdf", size: 3276800, uploadedAt: new Date("2026-03-13") },
  { id: "doc-4", name: "전략.pdf", size: 1843200, uploadedAt: new Date("2026-03-12") },
  { id: "doc-5", name: "법률검토.pdf", size: 921600, uploadedAt: new Date("2026-03-11") },
];

export const DUMMY_KNOWLEDGES: Knowledge[] = [
  { id: "kn-1", name: "마케팅 자료", description: "마케팅 전략 관련 문서 모음", documentIds: ["doc-1", "doc-2", "doc-4"] },
  { id: "kn-2", name: "기술 문서", description: "API 및 아키텍처 관련 자료", documentIds: ["doc-3", "doc-1"] },
  { id: "kn-3", name: "법률 검토", description: "계약서 및 규정 관련 문서", documentIds: ["doc-5"] },
];

export const DUMMY_SESSIONS: ChatSession[] = [];
```

- [ ] **Step 3: Zustand 스토어 작성**

```typescript
// frontend/lib/store.ts
import { create } from "zustand";
import { Document, Knowledge, ChatSession, ChatMessage } from "./types";
import { DUMMY_DOCUMENTS, DUMMY_KNOWLEDGES, DUMMY_SESSIONS } from "./dummy-data";

interface AppState {
  // Documents
  documents: Document[];
  addDocument: (doc: Document) => void;
  removeDocument: (id: string) => void;

  // Knowledge
  knowledges: Knowledge[];
  addKnowledge: (kn: Knowledge) => void;
  updateKnowledge: (id: string, updates: Partial<Knowledge>) => void;
  removeKnowledge: (id: string) => void;
  toggleDocumentInKnowledge: (knowledgeId: string, documentId: string) => void;

  // Chat Sessions
  sessions: ChatSession[];
  activeSessionId: string | null;
  createSession: () => string;
  setActiveSession: (id: string | null) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateSessionKnowledge: (sessionId: string, knowledgeIds: string[]) => void;
  addSessionDocument: (sessionId: string, doc: { name: string; size: number }) => void;

}

export const useAppStore = create<AppState>((set, get) => ({
  // Documents
  documents: DUMMY_DOCUMENTS,
  addDocument: (doc) => set((s) => ({ documents: [...s.documents, doc] })),
  removeDocument: (id) => set((s) => ({
    documents: s.documents.filter((d) => d.id !== id),
    knowledges: s.knowledges.map((k) => ({
      ...k,
      documentIds: k.documentIds.filter((did) => did !== id),
    })),
  })),

  // Knowledge
  knowledges: DUMMY_KNOWLEDGES,
  addKnowledge: (kn) => set((s) => ({ knowledges: [...s.knowledges, kn] })),
  updateKnowledge: (id, updates) => set((s) => ({
    knowledges: s.knowledges.map((k) => k.id === id ? { ...k, ...updates } : k),
  })),
  removeKnowledge: (id) => set((s) => ({
    knowledges: s.knowledges.filter((k) => k.id !== id),
  })),
  toggleDocumentInKnowledge: (knowledgeId, documentId) => set((s) => ({
    knowledges: s.knowledges.map((k) => {
      if (k.id !== knowledgeId) return k;
      const has = k.documentIds.includes(documentId);
      return {
        ...k,
        documentIds: has
          ? k.documentIds.filter((d) => d !== documentId)
          : [...k.documentIds, documentId],
      };
    }),
  })),

  // Chat Sessions
  sessions: DUMMY_SESSIONS,
  activeSessionId: null,
  createSession: () => {
    const id = `session-${Date.now()}`;
    const session: ChatSession = {
      id,
      title: "새 채팅",
      messages: [],
      knowledgeIds: [],
      sessionDocuments: [],
    };
    set((s) => ({ sessions: [...s.sessions, session], activeSessionId: id }));
    return id;
  },
  setActiveSession: (id) => set({ activeSessionId: id }),
  addMessage: (sessionId, message) => set((s) => ({
    sessions: s.sessions.map((sess) => {
      if (sess.id !== sessionId) return sess;
      const updated = { ...sess, messages: [...sess.messages, message] };
      if (message.role === "user" && sess.messages.length === 0) {
        updated.title = message.content.slice(0, 30) + (message.content.length > 30 ? "..." : "");
      }
      return updated;
    }),
  })),
  updateSessionKnowledge: (sessionId, knowledgeIds) => set((s) => ({
    sessions: s.sessions.map((sess) =>
      sess.id === sessionId ? { ...sess, knowledgeIds } : sess
    ),
  })),
  addSessionDocument: (sessionId, doc) => set((s) => ({
    sessions: s.sessions.map((sess) =>
      sess.id === sessionId
        ? { ...sess, sessionDocuments: [...sess.sessionDocuments, doc] }
        : sess
    ),
  })),

}));
```

- [ ] **Step 4: 스토어 기본 동작 확인 — 간단한 테스트 페이지 작성**

`frontend/app/page.tsx`를 임시로 수정하여 스토어가 동작하는지 확인:

```typescript
// frontend/app/page.tsx
"use client";
import { useAppStore } from "@/lib/store";

export default function Home() {
  const documents = useAppStore((s) => s.documents);
  const knowledges = useAppStore((s) => s.knowledges);
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Store Test</h1>
      <p>Documents: {documents.length}</p>
      <p>Knowledges: {knowledges.length}</p>
    </div>
  );
}
```

Run: `cd frontend && pnpm dev`
Expected: 브라우저에 "Documents: 5", "Knowledges: 3" 표시

- [ ] **Step 5: 커밋**

```bash
git add frontend/lib/ frontend/app/page.tsx
git commit -m "feat: add types, dummy data, and Zustand store"
```

---

## Task 3: 레이아웃 셸 (사이드바 + 메인 영역)

**Files:**
- Create: `frontend/components/layout/sidebar.tsx`
- Create: `frontend/components/layout/mobile-sidebar.tsx`
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: 사이드바 컴포넌트 작성**

```typescript
// frontend/components/layout/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, FileText, BookOpen, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "./theme-toggle";
import { SessionDropdown } from "@/components/chat/session-dropdown";

const NAV_ITEMS = [
  { href: "/chat", label: "Chat", icon: MessageSquare, hasDropdown: true },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-background">
      {/* App name */}
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-lg font-semibold">agentwebui-test</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map((item) => (
          <div key={item.href} className="flex items-center">
            <Link
              href={item.href}
              className={cn(
                "flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith(item.href)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
            {item.hasDropdown && <SessionDropdown />}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-3 space-y-3">
        <ThemeToggle />
        <div className="flex items-center gap-2 px-1">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">U</AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">Test User</span>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: 테마 토글 컴포넌트 작성**

```typescript
// frontend/components/layout/theme-toggle.tsx
"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="text-sm">{theme === "dark" ? "Dark" : "Light"} mode</span>
    </Button>
  );
}
```

- [ ] **Step 3: 모바일 사이드바 (Sheet 기반)**

```typescript
// frontend/components/layout/mobile-sidebar.tsx
"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";

export function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <Sidebar />
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: 세션 드롭다운 placeholder 작성**

```typescript
// frontend/components/chat/session-dropdown.tsx
"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/lib/store";

export function SessionDropdown() {
  const sessions = useAppStore((s) => s.sessions);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const createSession = useAppStore((s) => s.createSession);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onClick={() => createSession()}>
          새 채팅
        </DropdownMenuItem>
        {sessions.length > 0 && <DropdownMenuSeparator />}
        <div className="max-h-48 overflow-y-auto">
          {sessions.map((session) => (
            <DropdownMenuItem
              key={session.id}
              onClick={() => setActiveSession(session.id)}
            >
              {session.title}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 5: ThemeProvider 설정 및 루트 레이아웃 수정**

```typescript
// frontend/components/layout/theme-provider.tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
    </NextThemesProvider>
  );
}
```

```typescript
// frontend/app/layout.tsx
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "agentwebui-test",
  description: "AI Agent Web UI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <div className="flex h-screen">
            {/* Desktop sidebar */}
            <div className="hidden md:flex">
              <Sidebar />
            </div>
            {/* Main content */}
            <main className="flex flex-1 flex-col overflow-hidden">
              {/* Mobile header */}
              <div className="flex h-14 items-center border-b px-4 md:hidden">
                <MobileSidebar />
                <span className="ml-2 text-lg font-semibold">agentwebui-test</span>
              </div>
              <div className="flex-1 overflow-auto">
                {children}
              </div>
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: / → /chat 리다이렉트 설정**

```typescript
// frontend/app/page.tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/chat");
}
```

- [ ] **Step 7: 각 탭 placeholder 페이지 생성**

```typescript
// frontend/app/chat/page.tsx
export default function ChatPage() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Chat</h1></div>;
}

// frontend/app/documents/page.tsx
export default function DocumentsPage() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Documents</h1></div>;
}

// frontend/app/knowledge/page.tsx
export default function KnowledgePage() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Knowledge</h1></div>;
}
```

- [ ] **Step 8: 개발 서버에서 사이드바 + 탭 전환 + 테마 토글 확인**

Run: `cd frontend && pnpm dev`
Expected:
- 사이드바에 Chat/Documents/Knowledge 메뉴가 보임
- 클릭 시 메인 영역에 해당 페이지 표시
- 테마 토글로 라이트/다크 전환 동작
- 좁은 화면(< 768px)에서 햄버거 메뉴로 사이드바 열림

- [ ] **Step 9: 커밋**

```bash
git add frontend/
git commit -m "feat: add layout shell with sidebar, theme toggle, and routing"
```

---

## Task 4: Documents 탭

**Files:**
- Create: `frontend/components/documents/document-list.tsx`
- Create: `frontend/components/documents/upload-zone.tsx`
- Modify: `frontend/app/documents/page.tsx`

- [ ] **Step 1: 문서 목록 컴포넌트 작성 (아코디언 포함)**

```typescript
// frontend/components/documents/document-list.tsx
"use client";

import { useState } from "react";
import { FileText, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/lib/store";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function DocumentList() {
  const documents = useAppStore((s) => s.documents);
  const knowledges = useAppStore((s) => s.knowledges);
  const removeDocument = useAppStore((s) => s.removeDocument);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getKnowledgesForDoc = (docId: string) =>
    knowledges.filter((k) => k.documentIds.includes(docId));

  return (
    <div className="space-y-1">
      {documents.map((doc) => {
        const isExpanded = expandedId === doc.id;
        const docKnowledges = getKnowledgesForDoc(doc.id);

        return (
          <div key={doc.id} className="rounded-lg border bg-card">
            <button
              onClick={() => setExpandedId(isExpanded ? null : doc.id)}
              className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent/50 transition-colors rounded-lg"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{doc.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatFileSize(doc.size)} · {formatDate(doc.uploadedAt)} 업로드
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t px-4 py-3 space-y-3">
                <div>
                  <span className="text-xs font-medium text-muted-foreground">소속 Knowledge:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {docKnowledges.length > 0 ? (
                      docKnowledges.map((k) => (
                        <Badge key={k.id} variant="secondary">{k.name}</Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">없음</span>
                    )}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeDocument(doc.id)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> 삭제
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {documents.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          업로드된 문서가 없습니다
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 업로드 존 컴포넌트 작성**

```typescript
// frontend/components/documents/upload-zone.tsx
"use client";

import { useCallback, useState, useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import type { Document } from "@/lib/types";

export function UploadZone() {
  const addDocument = useAppStore((s) => s.addDocument);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList) => {
      Array.from(files).forEach((file) => {
        const doc: Document = {
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          size: file.size,
          uploadedAt: new Date(),
        };
        addDocument(doc);
      });
    },
    [addDocument]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  return (
    <div
      className="relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      <Button onClick={() => fileInputRef.current?.click()}>
        <Upload className="h-4 w-4 mr-2" /> 문서 추가
      </Button>

      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-primary p-12 text-center">
            <Upload className="mx-auto h-12 w-12 text-primary mb-4" />
            <p className="text-lg font-medium">여기에 파일을 놓으세요</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Documents 페이지 조합**

```typescript
// frontend/app/documents/page.tsx
import { DocumentList } from "@/components/documents/document-list";
import { UploadZone } from "@/components/documents/upload-zone";

export default function DocumentsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Documents</h1>
        <UploadZone />
      </div>
      <DocumentList />
    </div>
  );
}
```

- [ ] **Step 4: 개발 서버에서 확인**

Run: `cd frontend && pnpm dev` → http://localhost:3000/documents
Expected:
- 더미 문서 5개가 목록에 표시
- 문서 클릭 시 아코디언 펼쳐짐 (소속 Knowledge 배지 + 삭제 버튼)
- "+ 문서 추가" 클릭 시 파일 선택 가능, 선택 후 목록에 추가
- 파일 드래그 시 전체 화면 오버레이 → 드롭하면 목록에 추가
- "삭제" 클릭 시 문서가 목록에서 제거

- [ ] **Step 5: 커밋**

```bash
git add frontend/
git commit -m "feat: add Documents tab with upload and accordion"
```

---

## Task 5: Knowledge 탭 — 기본 상태 (카드 그리드)

**Files:**
- Create: `frontend/components/knowledge/knowledge-grid.tsx`
- Modify: `frontend/app/knowledge/page.tsx`

- [ ] **Step 1: Knowledge 카드 그리드 컴포넌트 작성**

```typescript
// frontend/components/knowledge/knowledge-grid.tsx
"use client";

import { Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import type { Knowledge } from "@/lib/types";

interface KnowledgeGridProps {
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function KnowledgeGrid({ onSelect, onCreate }: KnowledgeGridProps) {
  const knowledges = useAppStore((s) => s.knowledges);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Knowledge</h1>
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" /> 새로 만들기
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {knowledges.map((kn) => (
          <Card
            key={kn.id}
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => onSelect(kn.id)}
          >
            <CardHeader>
              <CardTitle className="text-base">📚 {kn.name}</CardTitle>
              <CardDescription>{kn.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm text-muted-foreground">
                {kn.documentIds.length}개 문서
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {knowledges.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Knowledge가 없습니다. 새로 만들어보세요.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Knowledge 페이지에 상태 전환 로직 추가**

```typescript
// frontend/app/knowledge/page.tsx
"use client";

import { useState } from "react";
import { KnowledgeGrid } from "@/components/knowledge/knowledge-grid";
import { KnowledgeEditor } from "@/components/knowledge/knowledge-editor";
import { useAppStore } from "@/lib/store";

export default function KnowledgePage() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const addKnowledge = useAppStore((s) => s.addKnowledge);

  const handleCreate = () => {
    const id = `kn-${Date.now()}`;
    addKnowledge({ id, name: "새 Knowledge", description: "설명을 입력하세요", documentIds: [] });
    setEditingId(id);
  };

  if (editingId) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <KnowledgeEditor knowledgeId={editingId} onBack={() => setEditingId(null)} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <KnowledgeGrid onSelect={setEditingId} onCreate={handleCreate} />
    </div>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/
git commit -m "feat: add Knowledge tab grid view with card layout"
```

---

## Task 6: Knowledge 탭 — 편집 상태

**Files:**
- Create: `frontend/components/knowledge/knowledge-editor.tsx`

- [ ] **Step 1: Knowledge 편집 컴포넌트 작성**

```typescript
// frontend/components/knowledge/knowledge-editor.tsx
"use client";

import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store";

interface KnowledgeEditorProps {
  knowledgeId: string;
  onBack: () => void;
}

export function KnowledgeEditor({ knowledgeId, onBack }: KnowledgeEditorProps) {
  const documents = useAppStore((s) => s.documents);
  const knowledge = useAppStore((s) => s.knowledges.find((k) => k.id === knowledgeId));
  const updateKnowledge = useAppStore((s) => s.updateKnowledge);
  const removeKnowledge = useAppStore((s) => s.removeKnowledge);
  const toggleDocumentInKnowledge = useAppStore((s) => s.toggleDocumentInKnowledge);

  if (!knowledge) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Knowledge를 찾을 수 없습니다.
        <Button variant="link" onClick={onBack}>목록으로</Button>
      </div>
    );
  }

  const handleDelete = () => {
    removeKnowledge(knowledgeId);
    onBack();
  };

  const includedDocs = documents.filter((d) => knowledge.documentIds.includes(d.id));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Knowledge 목록
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="h-4 w-4 mr-1" /> 삭제
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Knowledge 삭제</DialogTitle>
              <DialogDescription>
                &ldquo;{knowledge.name}&rdquo;을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="destructive" onClick={handleDelete}>삭제</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Document checklist */}
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold mb-3 text-sm text-muted-foreground">
            전체 문서 <span className="text-xs">(체크하여 추가/제거)</span>
          </h3>
          <div className="space-y-2">
            {documents.map((doc) => {
              const isChecked = knowledge.documentIds.includes(doc.id);
              return (
                <label
                  key={doc.id}
                  className={`flex items-center gap-3 rounded-md p-2 cursor-pointer transition-colors ${
                    isChecked ? "bg-primary/10" : "hover:bg-accent"
                  }`}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggleDocumentInKnowledge(knowledgeId, doc.id)}
                  />
                  <span className="text-sm">{doc.name}</span>
                </label>
              );
            })}
            {documents.length === 0 && (
              <p className="text-sm text-muted-foreground">문서가 없습니다. Documents 탭에서 추가해주세요.</p>
            )}
          </div>
        </div>

        {/* Right: Knowledge detail */}
        <div className="rounded-lg border p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">이름</label>
            <Input
              value={knowledge.name}
              onChange={(e) => updateKnowledge(knowledgeId, { name: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">설명</label>
            <Textarea
              value={knowledge.description}
              onChange={(e) => updateKnowledge(knowledgeId, { description: e.target.value })}
              className="mt-1"
              rows={3}
            />
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium mb-2">
              포함된 문서 ({includedDocs.length})
            </h4>
            <div className="space-y-1">
              {includedDocs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm">
                  📄 {doc.name}
                </div>
              ))}
              {includedDocs.length === 0 && (
                <p className="text-sm text-muted-foreground">왼쪽 체크리스트에서 문서를 선택하세요.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 개발 서버에서 확인**

Run: `cd frontend && pnpm dev` → http://localhost:3000/knowledge
Expected:
- Knowledge 카드 3개 표시 (마케팅 자료, 기술 문서, 법률 검토)
- 카드 클릭 → 편집 화면 전환
- 왼쪽 문서 체크리스트에서 체크/해제 → 오른쪽 포함 문서 실시간 반영
- 이름/설명 인라인 편집 가능
- "삭제" → 확인 다이얼로그 → 삭제 후 목록 복귀
- "+ 새로 만들기" → 새 Knowledge 생성 후 편집 화면 진입
- "← Knowledge 목록" 클릭 시 카드 그리드로 복귀

- [ ] **Step 3: 커밋**

```bash
git add frontend/
git commit -m "feat: add Knowledge editor with document checklist"
```

---

## Task 7: Chat 탭 — assistant-ui Primitive 기반 채팅 UI

**Files:**
- Create: `frontend/components/chat/mock-runtime-provider.tsx`
- Create: `frontend/components/assistant-ui/thread.tsx`
- Create: `frontend/components/chat/chat-view.tsx`
- Modify: `frontend/app/chat/page.tsx`

Note: `@assistant-ui/react`는 `ThreadPrimitive`, `ComposerPrimitive`, `MessagePrimitive` 등의 Primitive 빌딩 블록만 export합니다. `Thread`, `Composer`, `UserMessage`, `AssistantMessage` 등의 완성된 컴포넌트는 ailoy-web-ui 패턴을 참고하여 `components/assistant-ui/thread.tsx`에 로컬 래퍼로 정의합니다.

- [ ] **Step 1: Mock 런타임 프로바이더 작성**

assistant-ui는 런타임 프로바이더를 통해 AI 백엔드와 통신합니다. 목업에서는 더미 응답을 반환하는 프로바이더를 만듭니다.

```typescript
// frontend/components/chat/mock-runtime-provider.tsx
"use client";

import { useLocalRuntime, type ChatModelAdapter } from "@assistant-ui/react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAppStore } from "@/lib/store";

const MockModelAdapter: ChatModelAdapter = {
  async *run() {
    const knowledges = useAppStore.getState().knowledges;
    const sessions = useAppStore.getState().sessions;
    const activeSessionId = useAppStore.getState().activeSessionId;
    const activeSession = sessions.find((s) => s.id === activeSessionId);
    const selectedNames = knowledges
      .filter((k) => activeSession?.knowledgeIds.includes(k.id))
      .map((k) => k.name);

    let response: string;
    if (selectedNames.length > 0) {
      response = `선택하신 Knowledge(${selectedNames.join(", ")})를 기반으로 검색했습니다. 관련 내용을 찾았습니다.\n\n이것은 목업 응답입니다. 실제 AI 연결 시 이 부분이 실제 응답으로 대체됩니다.`;
    } else {
      response = "안녕하세요! Knowledge를 선택하시면 문서 기반 전문 답변을 드릴 수 있습니다.\n\n이것은 목업 응답입니다.";
    }

    await new Promise((resolve) => setTimeout(resolve, 300));

    yield {
      content: [{ type: "text" as const, text: response }],
    };
  },
};

export function MockRuntimeProvider({ children }: { children: React.ReactNode }) {
  const runtime = useLocalRuntime(MockModelAdapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

- [ ] **Step 2: assistant-ui Primitive 래퍼 컴포넌트 작성**

ailoy-web-ui 패턴을 참고하여 Primitive를 조합한 래퍼 컴포넌트를 정의합니다.

```typescript
// frontend/components/assistant-ui/thread.tsx
"use client";

import type { FC } from "react";
import { ArrowUpIcon } from "lucide-react";
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import { Button } from "@/components/ui/button";

/** 전체 채팅 스레드 */
export const Thread: FC<{ children?: React.ReactNode }> = () => {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col bg-background">
      <ThreadPrimitive.Viewport className="relative flex flex-1 flex-col overflow-y-auto px-4">
        <ThreadPrimitive.If empty>
          <ThreadWelcome />
        </ThreadPrimitive.If>

        <ThreadPrimitive.If empty={false}>
          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />
          <div className="min-h-8 grow" />
        </ThreadPrimitive.If>

        <Composer />
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

/** 메시지가 없을 때 보이는 환영 화면 */
export const ThreadWelcome: FC = () => {
  return (
    <div className="mx-auto my-auto flex w-full max-w-2xl flex-grow flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <h2 className="text-xl font-semibold text-muted-foreground">
          agentwebui-test에 질문하세요
        </h2>
        <p className="text-sm text-muted-foreground text-center">
          좌상단 버튼으로 Knowledge를 활성화하면
          <br />
          문서 기반 대화가 가능합니다
        </p>
      </div>
    </div>
  );
};

/** 메시지 입력 + 전송 버튼 */
export const Composer: FC = () => {
  return (
    <div className="sticky bottom-0 mx-auto flex w-full max-w-2xl flex-col gap-4 bg-background pb-4">
      <ComposerPrimitive.Root className="relative flex w-full flex-col rounded-2xl border border-input bg-background px-1 pt-2 shadow-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50">
        <ComposerPrimitive.Input
          placeholder="메시지를 입력하세요..."
          className="mb-1 max-h-32 min-h-[60px] w-full resize-none bg-transparent px-3.5 pt-1.5 pb-3 text-base outline-none placeholder:text-muted-foreground"
          rows={1}
          autoFocus
        />
        <div className="mx-1 mb-2 flex items-center justify-end">
          <ComposerPrimitive.Send asChild>
            <Button type="submit" size="icon" className="h-8 w-8 rounded-full">
              <ArrowUpIcon className="h-4 w-4" />
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
};

/** AI 어시스턴트 메시지 */
export const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="relative mx-auto w-full max-w-2xl py-4">
      <div className="leading-7 break-words text-foreground">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
};

/** 유저 메시지 */
export const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="mx-auto w-full max-w-2xl py-4">
      <div className="flex justify-end">
        <div className="rounded-2xl bg-muted px-4 py-2.5 break-words text-foreground">
          <MessagePrimitive.Content />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};
```

- [ ] **Step 3: 채팅 뷰 컴포넌트 작성 (래퍼 import)**

```typescript
// frontend/components/chat/chat-view.tsx
"use client";

import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Thread } from "@/components/assistant-ui/thread";

interface ChatViewProps {
  onToggleKnowledgePanel: () => void;
  isKnowledgePanelOpen: boolean;
}

export function ChatView({ onToggleKnowledgePanel, isKnowledgePanelOpen }: ChatViewProps) {
  return (
    <div className="flex flex-col h-full relative">
      {/* Floating Knowledge button */}
      <div className="absolute top-3 left-3 z-10">
        <Button
          variant={isKnowledgePanelOpen ? "default" : "outline"}
          size="icon"
          onClick={onToggleKnowledgePanel}
          title="Knowledge 패널"
        >
          <BookOpen className="h-4 w-4" />
        </Button>
      </div>

      {/* assistant-ui Thread (Primitive 래퍼) */}
      <Thread />
    </div>
  );
}
```
```

- [ ] **Step 2: Chat 페이지 조합**

```typescript
// frontend/app/chat/page.tsx
"use client";

import { useState } from "react";
import { MockRuntimeProvider } from "@/components/chat/mock-runtime-provider";
import { ChatView } from "@/components/chat/chat-view";
import { KnowledgePanel } from "@/components/chat/knowledge-panel";

export default function ChatPage() {
  const [isKnowledgePanelOpen, setIsKnowledgePanelOpen] = useState(false);

  return (
    <MockRuntimeProvider>
      <div className="flex h-full">
        {isKnowledgePanelOpen && (
          <KnowledgePanel onClose={() => setIsKnowledgePanelOpen(false)} />
        )}
        <div className="flex-1">
          <ChatView
            onToggleKnowledgePanel={() => setIsKnowledgePanelOpen((v) => !v)}
            isKnowledgePanelOpen={isKnowledgePanelOpen}
          />
        </div>
      </div>
    </MockRuntimeProvider>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/
git commit -m "feat: add Chat tab with message UI and dummy responses"
```

---

## Task 8: Chat — Knowledge 플로팅 패널

**Files:**
- Create: `frontend/components/chat/knowledge-panel.tsx`

- [ ] **Step 1: Knowledge 패널 컴포넌트 작성**

```typescript
// frontend/components/chat/knowledge-panel.tsx
"use client";

import { useRef } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/lib/store";
import type { Document as DocType } from "@/lib/types";

interface KnowledgePanelProps {
  onClose: () => void;
}

export function KnowledgePanel({ onClose }: KnowledgePanelProps) {
  const knowledges = useAppStore((s) => s.knowledges);
  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const updateSessionKnowledge = useAppStore((s) => s.updateSessionKnowledge);
  const addSessionDocument = useAppStore((s) => s.addSessionDocument);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const selectedKnowledgeIds = activeSession?.knowledgeIds ?? [];
  const sessionDocs = activeSession?.sessionDocuments ?? [];
  const allSelected = knowledges.length > 0 && knowledges.every((k) => selectedKnowledgeIds.includes(k.id));

  const toggleKnowledge = (knowledgeId: string) => {
    if (!activeSessionId) return;
    const current = selectedKnowledgeIds;
    const updated = current.includes(knowledgeId)
      ? current.filter((id) => id !== knowledgeId)
      : [...current, knowledgeId];
    updateSessionKnowledge(activeSessionId, updated);
  };

  const toggleAll = () => {
    if (!activeSessionId) return;
    if (allSelected) {
      updateSessionKnowledge(activeSessionId, []);
    } else {
      updateSessionKnowledge(activeSessionId, knowledges.map((k) => k.id));
    }
  };

  const handleExtraFile = (files: FileList) => {
    if (!activeSessionId) return;
    Array.from(files).forEach((file) => {
      addSessionDocument(activeSessionId, { name: file.name, size: file.size });
    });
  };

  return (
    <div className="w-64 border-r bg-background flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <span className="font-semibold text-sm">Knowledge</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Select all */}
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
          <span className="text-sm font-medium">전체 문서 사용</span>
        </label>

        <Separator />

        {/* Knowledge list */}
        <div className="space-y-2">
          {knowledges.map((kn) => (
            <label
              key={kn.id}
              className={`flex items-center gap-2 rounded-md p-2 cursor-pointer transition-colors ${
                selectedKnowledgeIds.includes(kn.id) ? "bg-primary/10" : "hover:bg-accent"
              }`}
            >
              <Checkbox
                checked={selectedKnowledgeIds.includes(kn.id)}
                onCheckedChange={() => toggleKnowledge(kn.id)}
              />
              <span className="text-sm">{kn.name}</span>
            </label>
          ))}
        </div>

        <Separator />

        {/* Extra documents */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleExtraFile(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="h-3 w-3 mr-1" /> 별도 문서 포함
          </Button>
          {sessionDocs.length > 0 && (
            <div className="mt-2 space-y-1">
              {sessionDocs.map((doc, i) => (
                <div key={i} className="text-xs text-muted-foreground truncate px-1">
                  📄 {doc.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 개발 서버에서 전체 Chat 흐름 확인**

Run: `cd frontend && pnpm dev` → http://localhost:3000/chat
Expected:
- 빈 채팅 화면 + Knowledge 힌트 문구
- 좌상단 📚 버튼 클릭 → Knowledge 패널 열림/닫힘
- Knowledge 체크 후 메시지 입력 → 더미 응답에 선택 Knowledge 이름 포함
- "전체 문서 사용" → 모든 Knowledge 체크/해제
- "+ 별도 문서 포함" → 파일 선택 → 패널에 파일명 표시
- Enter로 메시지 전송, Shift+Enter로 줄바꿈

- [ ] **Step 3: 커밋**

```bash
git add frontend/
git commit -m "feat: add Chat Knowledge panel with floating toggle"
```

---

## Task 9: 세션 관리 완성 + 사이드바 연동

**Files:**
- Modify: `frontend/components/chat/session-dropdown.tsx` (이미 Task 3에서 생성)
- Modify: `frontend/components/layout/sidebar.tsx`

- [ ] **Step 1: 사이드바에서 Chat 클릭 시 새 세션 생성 로직 연결**

`sidebar.tsx`의 네비게이션 렌더링 부분을 수정합니다. Chat 메뉴를 클릭하면 새 세션을 생성하고 `/chat`으로 이동합니다. 전체 `<nav>` 블록을 아래로 교체:

```typescript
// frontend/components/layout/sidebar.tsx — nav 블록 교체
<nav className="flex-1 space-y-1 p-2">
  {NAV_ITEMS.map((item) => {
    const isActive = pathname.startsWith(item.href);
    const linkClasses = cn(
      "flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      isActive
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    );

    return (
      <div key={item.href} className="flex items-center">
        {item.href === "/chat" ? (
          <Link
            href="/chat"
            onClick={() => useAppStore.getState().createSession()}
            className={linkClasses}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ) : (
          <Link href={item.href} className={linkClasses}>
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        )}
        {item.hasDropdown && <SessionDropdown />}
      </div>
    );
  })}
</nav>
```

`useAppStore`를 import에 추가해야 합니다:
```typescript
import { useAppStore } from "@/lib/store";
```

- [ ] **Step 2: 세션 드롭다운에서 세션 선택 시 Chat 페이지로 이동**

```typescript
// session-dropdown.tsx 수정: useRouter 추가
import { useRouter } from "next/navigation";

// 컴포넌트 내부:
const router = useRouter();

// DropdownMenuItem onClick에 router.push 추가
<DropdownMenuItem onClick={() => {
  createSession();
  router.push("/chat");
}}>
  새 채팅
</DropdownMenuItem>

// 세션 선택:
<DropdownMenuItem onClick={() => {
  setActiveSession(session.id);
  router.push("/chat");
}}>
  {session.title}
</DropdownMenuItem>
```

- [ ] **Step 3: 확인 및 커밋**

Run: `cd frontend && pnpm dev`
Expected:
- 사이드바 "Chat" 클릭 → 새 세션 + Chat 페이지
- ▼ 드롭다운 → 이전 세션 클릭 → 해당 세션 복원
- 여러 세션 생성 후 드롭다운에서 스크롤 가능

```bash
git add frontend/
git commit -m "feat: complete session management with sidebar integration"
```

---

## Task 10: 최종 통합 + 빌드 확인

**Files:**
- Modify: 전체 (필요시 버그 수정)

- [ ] **Step 1: 전체 빌드 확인**

```bash
cd frontend
pnpm build
```

Expected: 에러 없이 빌드 완료

- [ ] **Step 2: 전체 기능 수동 테스트 체크리스트**

- [ ] 사이드바 Chat/Documents/Knowledge 탭 전환 동작
- [ ] 테마 토글 (라이트 ↔ 다크) 동작
- [ ] 모바일 반응형 (브라우저 좁히기) 사이드바 접힘 + 햄버거 메뉴
- [ ] Documents: 문서 목록 표시, 아코디언 펼침, 삭제, 업로드(버튼+드래그)
- [ ] Knowledge: 카드 그리드, 새로 만들기, 편집(이름/설명/문서 체크리스트), 삭제
- [ ] Chat: 빈 상태, 메시지 전송, 더미 응답, Knowledge 패널 토글
- [ ] Chat: 세션 드롭다운, 새 채팅, 이전 세션 전환
- [ ] Documents ↔ Knowledge 연동: 문서 삭제 시 Knowledge에서도 제거

- [ ] **Step 3: .gitignore 업데이트**

```bash
echo ".superpowers/" >> /Users/jeffrey/workspace/agentwebui-test/.gitignore
```

- [ ] **Step 4: 최종 커밋**

```bash
git add .
git commit -m "feat: complete frontend mockup with all tabs and interactions"
```

---

## Summary

| Task | 내용 | 주요 파일 |
|------|------|----------|
| 1 | 프로젝트 스캐폴딩 | package.json, 설정 파일들 |
| 2 | 타입 + 더미 데이터 + Zustand 스토어 | lib/types.ts, lib/store.ts |
| 3 | 레이아웃 셸 (사이드바 + 라우팅 + 테마) | layout.tsx, sidebar.tsx |
| 4 | Documents 탭 | document-list.tsx, upload-zone.tsx |
| 5 | Knowledge 카드 그리드 | knowledge-grid.tsx |
| 6 | Knowledge 편집 | knowledge-editor.tsx |
| 7 | Chat 기본 UI | chat-view.tsx |
| 8 | Chat Knowledge 패널 | knowledge-panel.tsx |
| 9 | 세션 관리 + 사이드바 연동 | session-dropdown.tsx |
| 10 | 최종 통합 + 빌드 확인 | 전체 |
