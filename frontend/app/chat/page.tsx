"use client";

import { ApiRuntimeProvider } from "@/components/chat/api-runtime-provider";
import { ChatView } from "@/components/chat/chat-view";
import { NewChatSetup } from "@/components/chat/new-chat-setup";
import { SessionTitle } from "@/components/chat/session-title";
import { useAppStore } from "@/lib/store";

export default function ChatPage() {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const setActiveSession = useAppStore((s) => s.setActiveSession);

  if (!activeSessionId) {
    return (
      <NewChatSetup
        onSessionCreated={(sessionId) => setActiveSession(sessionId)}
      />
    );
  }

  return (
    <ApiRuntimeProvider key={activeSessionId} sessionId={activeSessionId}>
      <div className="flex-1 flex flex-col overflow-hidden h-full">
        <SessionTitle sessionId={activeSessionId} />
        <div className="flex-1 overflow-hidden">
          <ChatView />
        </div>
      </div>
    </ApiRuntimeProvider>
  );
}
