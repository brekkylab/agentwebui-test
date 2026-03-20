"use client";

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
import { useAppStore } from "@/lib/store";

interface KnowledgeEditorProps {
  knowledgeId: string;
  onBack: () => void;
}

export function KnowledgeEditor({ knowledgeId, onBack }: KnowledgeEditorProps) {
  const documents = useAppStore((s) => s.documents);
  const knowledge = useAppStore((s) =>
    s.knowledges.find((k) => k.id === knowledgeId)
  );
  const updateKnowledge = useAppStore((s) => s.updateKnowledge);
  const removeKnowledge = useAppStore((s) => s.removeKnowledge);
  const toggleDocumentInKnowledge = useAppStore(
    (s) => s.toggleDocumentInKnowledge
  );

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

  const handleDelete = () => {
    removeKnowledge(knowledgeId);
    onBack();
  };

  const includedDocs = documents.filter((d) =>
    knowledge.documentIds.includes(d.id)
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
            전체 문서{" "}
            <span className="text-xs">(체크하여 추가/제거)</span>
          </h3>
          <div className="space-y-2">
            {documents.map((doc) => {
              const isChecked = knowledge.documentIds.includes(doc.id);
              return (
                <label
                  key={doc.id}
                  className={`flex items-center gap-3 rounded-md p-2 cursor-pointer transition-colors ${
                    isChecked ? "bg-primary/10" : "hover:bg-accent"
                  }`}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() =>
                      toggleDocumentInKnowledge(knowledgeId, doc.id)
                    }
                  />
                  <span className="text-sm">{doc.name}</span>
                </label>
              );
            })}
            {documents.length === 0 && (
              <p className="text-sm text-muted-foreground">
                문서가 없습니다. Documents 탭에서 추가해주세요.
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
              onChange={(e) =>
                updateKnowledge(knowledgeId, { name: e.target.value })
              }
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              설명
            </label>
            <Textarea
              value={knowledge.description}
              onChange={(e) =>
                updateKnowledge(knowledgeId, { description: e.target.value })
              }
              className="mt-1"
              rows={3}
            />
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium mb-2">
              포함된 문서 ({includedDocs.length})
            </h4>
            <div className="space-y-1">
              {includedDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm"
                >
                  {doc.name}
                </div>
              ))}
              {includedDocs.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  왼쪽 체크리스트에서 문서를 선택하세요.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
