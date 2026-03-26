"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, BookOpen, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "./theme-toggle";
import { SessionList } from "@/components/chat/session-list";

const NAV_ITEMS = [
  { href: "/sources", label: "Sources", icon: Database },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-background">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-lg font-semibold">agentwebui-test</span>
      </div>

      <nav className="space-y-1 p-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3">
        <Separator />
      </div>

      <div className="flex-1 overflow-hidden p-2">
        <SessionList />
      </div>

      <div className="border-t p-3 space-y-3">
        <ThemeToggle />
        <div className="flex items-center gap-2 px-1">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">U</AvatarFallback>
          </Avatar>
          <span className="flex-1 text-sm text-muted-foreground">Test User</span>
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </aside>
  );
}
