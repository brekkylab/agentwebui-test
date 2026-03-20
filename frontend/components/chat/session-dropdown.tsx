"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
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
  const removeSession = useAppStore((s) => s.removeSession);
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="h-7 w-7" />}
      >
        <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem
          onClick={() => {
            createSession();
            router.push("/chat");
          }}
        >
          새 채팅
        </DropdownMenuItem>
        {sessions.length > 0 && <DropdownMenuSeparator />}
        <div className="max-h-48 overflow-y-auto">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center">
              <DropdownMenuItem
                className="flex-1"
                onClick={() => {
                  setActiveSession(session.id);
                  router.push("/chat");
                }}
              >
                <span className="truncate">{session.title}</span>
              </DropdownMenuItem>
              <button
                className="mx-1 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  removeSession(session.id);
                }}
                title="세션 삭제"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
