"use client";

import { useState, useEffect } from "react";
import { MockRuntimeProvider } from "@/components/chat/mock-runtime-provider";
import { ChatView } from "@/components/chat/chat-view";
import { KnowledgePanel } from "@/components/chat/knowledge-panel";
import { useAppStore } from "@/lib/store";

export default function ChatPage() {
  const [isKnowledgePanelOpen, setIsKnowledgePanelOpen] = useState(false);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const createSession = useAppStore((s) => s.createSession);

  // 세션이 없으면 자동 생성
  useEffect(() => {
    if (!activeSessionId) {
      createSession();
    }
  }, [activeSessionId, createSession]);

  if (!activeSessionId) return null;

  return (
    <MockRuntimeProvider key={activeSessionId} sessionId={activeSessionId}>
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
