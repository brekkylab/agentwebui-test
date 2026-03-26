"use client";

import { useState, useRef, useEffect } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Thread } from "@/components/assistant-ui/thread";
import { KnowledgePanel } from "@/components/chat/knowledge-panel";

export function ChatView() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // 패널 외부 클릭 시 닫기
  useEffect(() => {
    if (!isPanelOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isPanelOpen]);

  return (
    <div className="flex flex-col h-full relative">
      <div className="absolute top-3 left-3 z-10">
        <Button
          ref={buttonRef}
          variant={isPanelOpen ? "default" : "outline"}
          size="icon"
          onClick={() => setIsPanelOpen((v) => !v)}
          title="Knowledge 패널"
        >
          <BookOpen className="h-4 w-4" />
        </Button>

        {isPanelOpen && (
          <div
            ref={panelRef}
            className="absolute top-12 left-0 z-20 rounded-lg border bg-background shadow-lg"
          >
            <KnowledgePanel onClose={() => setIsPanelOpen(false)} />
          </div>
        )}
      </div>

      <Thread />
    </div>
  );
}
