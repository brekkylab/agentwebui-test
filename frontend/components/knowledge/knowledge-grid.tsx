"use client";

import { Plus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

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
              <CardTitle className="text-base">{kn.name}</CardTitle>
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
