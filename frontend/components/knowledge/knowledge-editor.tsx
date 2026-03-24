"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getKnowledges,
  getSources,
  updateKnowledge,
  deleteKnowledge,
} from "@/lib/api";
import type { ApiSource, ApiKnowledge } from "@/lib/types";

interface KnowledgeEditorProps {
  knowledgeId: string;
  onBack: () => void;
}

export function KnowledgeEditor({ knowledgeId, onBack }: KnowledgeEditorProps) {
  const [sources, setSources] = useState<ApiSource[]>([]);
  const [knowledge, setKnowledge] = useState<ApiKnowledge | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [srcData, knData] = await Promise.all([
        getSources(),
        getKnowledges(),
      ]);
      setSources(srcData);
      const found = knData.find((k) => k.id === knowledgeId);
      setKnowledge(found ?? null);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }, [knowledgeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpdate = async (updates: Partial<Pick<ApiKnowledge, "name" | "description" | "source_ids">>) => {
    if (!knowledge) return;
    const updated = {
      name: updates.name ?? knowledge.name,
      description: updates.description ?? knowledge.description,
      source_ids: updates.source_ids ?? knowledge.source_ids,
    };
    try {
      const result = await updateKnowledge(knowledgeId, updated);
      setKnowledge(result);
    } catch (error) {
      console.error("Failed to update knowledge:", error);
    }
  };

  const toggleSource = (sourceId: string) => {
    if (!knowledge) return;
    const has = knowledge.source_ids.includes(sourceId);
    const newIds = has
      ? knowledge.source_ids.filter((id) => id !== sourceId)
      : [...knowledge.source_ids, sourceId];
    handleUpdate({ source_ids: newIds });
  };

  const handleDelete = async () => {
    try {
      await deleteKnowledge(knowledgeId);
      onBack();
    } catch (error) {
      console.error("Failed to delete knowledge:", error);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  if (!knowledge) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Knowledge를 찾을 수 없습니다.
        <Button variant="link" onClick={onBack}>
          목록으로
        </Button>
      </div>
    );
  }

  const includedSources = sources.filter((s) =>
    knowledge.source_ids.includes(s.id)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Knowledge 목록
        </Button>
        <Dialog>
          <DialogTrigger
            render={<Button variant="destructive" size="sm" />}
          >
            <Trash2 className="h-4 w-4 mr-1" /> 삭제
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Knowledge 삭제</DialogTitle>
              <DialogDescription>
                &ldquo;{knowledge.name}&rdquo;을(를) 삭제하시겠습니까? 이 작업은
                되돌릴 수 없습니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="destructive" onClick={handleDelete}>
                삭제
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold mb-3 text-sm text-muted-foreground">
            전체 소스{" "}
            <span className="text-xs">(체크하여 추가/제거)</span>
          </h3>
          <div className="space-y-2">
            {sources.map((src) => {
              const isChecked = knowledge.source_ids.includes(src.id);
              return (
                <label
                  key={src.id}
                  className={`flex items-center gap-3 rounded-md p-2 cursor-pointer transition-colors ${
                    isChecked ? "bg-primary/10" : "hover:bg-accent"
                  }`}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggleSource(src.id)}
                  />
                  <span className="text-sm">{src.name}</span>
                </label>
              );
            })}
            {sources.length === 0 && (
              <p className="text-sm text-muted-foreground">
                소스가 없습니다. Sources 탭에서 추가해주세요.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              이름
            </label>
            <Input
              value={knowledge.name}
              onChange={(e) => handleUpdate({ name: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              설명
            </label>
            <Textarea
              value={knowledge.description}
              onChange={(e) => handleUpdate({ description: e.target.value })}
              className="mt-1"
              rows={3}
            />
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium mb-2">
              포함된 소스 ({includedSources.length})
            </h4>
            <div className="space-y-1">
              {includedSources.map((src) => (
                <div
                  key={src.id}
                  className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm"
                >
                  {src.name}
                </div>
              ))}
              {includedSources.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  왼쪽 체크리스트에서 소스를 선택하세요.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
