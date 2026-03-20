"use client";

import type { ChatModelAdapter } from "@assistant-ui/react";
import { useLocalRuntime, AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAppStore } from "@/lib/store";
import type { ChatMessage } from "@/lib/types";

function createMockAdapter(sessionId: string): ChatModelAdapter {
  return {
    async *run({ messages }) {
      // 세션 ID를 run() 시작 시점에 캡처하여 race condition 방지
      const capturedSessionId = sessionId;

      // 마지막 user 메시지를 추출하여 Zustand에 저장
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === "user") {
        const textPart = lastMsg.content.find(
          (p): p is { type: "text"; text: string } => p.type === "text"
        );
        if (textPart) {
          const userMessage: ChatMessage = {
            role: "user",
            content: textPart.text,
            createdAt: new Date(),
          };
          useAppStore.getState().addMessage(capturedSessionId, userMessage);
        }
      }

      // Knowledge 기반 더미 응답 생성
      const state = useAppStore.getState();
      const session = state.sessions.find((s) => s.id === capturedSessionId);
      const selectedNames = state.knowledges
        .filter((k) => session?.knowledgeIds.includes(k.id))
        .map((k) => k.name);

      const sessionDocNames = session?.sessionDocuments.map((d) => d.name) ?? [];

      let response: string;
      const parts: string[] = [];

      if (selectedNames.length > 0) {
        parts.push(`선택하신 Knowledge(${selectedNames.join(", ")})를 기반으로 검색했습니다.`);
      }
      if (sessionDocNames.length > 0) {
        parts.push(`별도 첨부된 문서(${sessionDocNames.join(", ")})도 함께 참고했습니다.`);
      }

      if (parts.length > 0) {
        response = `${parts.join(" ")} 관련 내용을 찾았습니다.\n\n이것은 목업 응답입니다. 실제 AI 연결 시 이 부분이 실제 응답으로 대체됩니다.`;
      } else {
        response =
          "안녕하세요! Knowledge를 선택하거나 별도 문서를 첨부하시면 문서 기반 전문 답변을 드릴 수 있습니다.\n\n이것은 목업 응답입니다.";
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Assistant 응답을 Zustand에 저장
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response,
        createdAt: new Date(),
      };
      useAppStore.getState().addMessage(capturedSessionId, assistantMessage);

      yield {
        content: [{ type: "text" as const, text: response }],
      };
    },
  };
}

export function MockRuntimeProvider({
  children,
  sessionId,
}: {
  children: React.ReactNode;
  sessionId: string;
}) {
  // 현재 세션의 메시지를 Zustand에서 읽어 initialMessages로 전달
  const sessionMessages = useAppStore((s) => {
    const session = s.sessions.find((sess) => sess.id === sessionId);
    return session?.messages ?? [];
  });

  // ChatMessage → ThreadMessageLike 변환
  const initialMessages = sessionMessages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
    createdAt: m.createdAt,
  }));

  const adapter = createMockAdapter(sessionId);
  const runtime = useLocalRuntime(adapter, { initialMessages });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
