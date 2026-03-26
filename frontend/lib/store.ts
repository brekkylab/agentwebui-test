import { create } from "zustand";
import type { SessionSource } from "./types";

// ============================================================
// Zustand State Boundary
// ============================================================
// Backend (API)       | Zustand (UI state)
// --------------------|---------------------------
// Provider Profiles   | —
// Agents              | —
// Sessions list       | —
// Session messages    | —
// Sources             | —
// Knowledges          | —
// —                   | activeSessionId
// —                   | sessionLocalData (Knowledge/Source associations per session)
// ============================================================

interface SessionLocalData {
  knowledgeIds: string[];
  sessionSources: SessionSource[];
}

interface AppState {
  // Active session (UI state)
  activeSessionId: string | null;
  setActiveSession: (id: string | null) => void;
  sessionListVersion: number;
  bumpSessionListVersion: () => void;

  // Per-session local data (Knowledge/Source associations — not in Backend)
  sessionLocalData: Record<string, SessionLocalData>;
  getSessionLocalData: (sessionId: string) => SessionLocalData;
  updateSessionKnowledge: (sessionId: string, knowledgeIds: string[]) => void;
  addSessionSource: (sessionId: string, src: SessionSource) => void;
  removeSessionSource: (sessionId: string, index: number) => void;
  removeSessionLocalData: (sessionId: string) => void;
}

const DEFAULT_SESSION_LOCAL: SessionLocalData = {
  knowledgeIds: [],
  sessionSources: [],
};

export const useAppStore = create<AppState>((set, get) => ({
  // Active session
  activeSessionId: null,
  setActiveSession: (id) => set({ activeSessionId: id }),
  sessionListVersion: 0,
  bumpSessionListVersion: () => set((s) => ({ sessionListVersion: s.sessionListVersion + 1 })),

  // Per-session local data
  sessionLocalData: {},
  getSessionLocalData: (sessionId) => {
    return get().sessionLocalData[sessionId] ?? DEFAULT_SESSION_LOCAL;
  },
  updateSessionKnowledge: (sessionId, knowledgeIds) =>
    set((s) => ({
      sessionLocalData: {
        ...s.sessionLocalData,
        [sessionId]: {
          ...(s.sessionLocalData[sessionId] ?? DEFAULT_SESSION_LOCAL),
          knowledgeIds,
        },
      },
    })),
  addSessionSource: (sessionId, src) =>
    set((s) => {
      const current = s.sessionLocalData[sessionId] ?? DEFAULT_SESSION_LOCAL;
      return {
        sessionLocalData: {
          ...s.sessionLocalData,
          [sessionId]: {
            ...current,
            sessionSources: [...current.sessionSources, src],
          },
        },
      };
    }),
  removeSessionSource: (sessionId, index) =>
    set((s) => {
      const current = s.sessionLocalData[sessionId] ?? DEFAULT_SESSION_LOCAL;
      return {
        sessionLocalData: {
          ...s.sessionLocalData,
          [sessionId]: {
            ...current,
            sessionSources: current.sessionSources.filter((_, i) => i !== index),
          },
        },
      };
    }),
  removeSessionLocalData: (sessionId) =>
    set((s) => {
      const { [sessionId]: _, ...rest } = s.sessionLocalData;
      return { sessionLocalData: rest };
    }),
}));
