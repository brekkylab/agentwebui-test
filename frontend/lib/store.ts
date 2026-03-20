import { create } from "zustand";
import type { Document, Knowledge, ChatSession, ChatMessage, SessionDocument } from "./types";
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
  removeSession: (id: string) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateSessionKnowledge: (sessionId: string, knowledgeIds: string[]) => void;
  addSessionDocument: (sessionId: string, doc: SessionDocument) => void;
  removeSessionDocument: (sessionId: string, index: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Documents
  documents: DUMMY_DOCUMENTS,
  addDocument: (doc) =>
    set((s) => ({ documents: [...s.documents, doc] })),
  removeDocument: (id) =>
    set((s) => ({
      documents: s.documents.filter((d) => d.id !== id),
      knowledges: s.knowledges.map((k) => ({
        ...k,
        documentIds: k.documentIds.filter((did) => did !== id),
      })),
    })),

  // Knowledge
  knowledges: DUMMY_KNOWLEDGES,
  addKnowledge: (kn) =>
    set((s) => ({ knowledges: [...s.knowledges, kn] })),
  updateKnowledge: (id, updates) =>
    set((s) => ({
      knowledges: s.knowledges.map((k) =>
        k.id === id ? { ...k, ...updates } : k
      ),
    })),
  removeKnowledge: (id) =>
    set((s) => ({
      knowledges: s.knowledges.filter((k) => k.id !== id),
    })),
  toggleDocumentInKnowledge: (knowledgeId, documentId) =>
    set((s) => ({
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
  removeSession: (id) =>
    set((s) => {
      const filtered = s.sessions.filter((sess) => sess.id !== id);
      const newActiveId =
        s.activeSessionId === id
          ? filtered.length > 0
            ? filtered[0].id
            : null
          : s.activeSessionId;
      return { sessions: filtered, activeSessionId: newActiveId };
    }),
  addMessage: (sessionId, message) =>
    set((s) => ({
      sessions: s.sessions.map((sess) => {
        if (sess.id !== sessionId) return sess;
        const updated = { ...sess, messages: [...sess.messages, message] };
        if (message.role === "user" && sess.messages.length === 0) {
          updated.title =
            message.content.slice(0, 30) +
            (message.content.length > 30 ? "..." : "");
        }
        return updated;
      }),
    })),
  updateSessionKnowledge: (sessionId, knowledgeIds) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, knowledgeIds } : sess
      ),
    })),
  addSessionDocument: (sessionId, doc) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId
          ? { ...sess, sessionDocuments: [...sess.sessionDocuments, doc] }
          : sess
      ),
    })),
  removeSessionDocument: (sessionId, index) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId
          ? {
              ...sess,
              sessionDocuments: sess.sessionDocuments.filter((_, i) => i !== index),
            }
          : sess
      ),
    })),
}));
