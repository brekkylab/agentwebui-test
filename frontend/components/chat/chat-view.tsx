"use client";

import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Thread } from "@/components/assistant-ui/thread";

interface ChatViewProps {
  onToggleKnowledgePanel: () => void;
  isKnowledgePanelOpen: boolean;
}

export function ChatView({
  onToggleKnowledgePanel,
  isKnowledgePanelOpen,
}: ChatViewProps) {
  return (
    <div className="flex flex-col h-full relative">
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

      <Thread />
    </div>
  );
}
