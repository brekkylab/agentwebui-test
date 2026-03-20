"use client";

import { useState } from "react";
import { FileText, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/lib/store";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function DocumentList() {
  const documents = useAppStore((s) => s.documents);
  const knowledges = useAppStore((s) => s.knowledges);
  const removeDocument = useAppStore((s) => s.removeDocument);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getKnowledgesForDoc = (docId: string) =>
    knowledges.filter((k) => k.documentIds.includes(docId));

  return (
    <div className="space-y-1">
      {documents.map((doc) => {
        const isExpanded = expandedId === doc.id;
        const docKnowledges = getKnowledgesForDoc(doc.id);

        return (
          <div key={doc.id} className="rounded-lg border bg-card">
            <button
              onClick={() => setExpandedId(isExpanded ? null : doc.id)}
              className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent/50 transition-colors rounded-lg"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{doc.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatFileSize(doc.size)} · {formatDate(doc.uploadedAt)} 업로드
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t px-4 py-3 space-y-3">
                <div>
                  <span className="text-xs font-medium text-muted-foreground">
                    소속 Knowledge:
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {docKnowledges.length > 0 ? (
                      docKnowledges.map((k) => (
                        <Badge key={k.id} variant="secondary">
                          {k.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">없음</span>
                    )}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeDocument(doc.id)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> 삭제
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {documents.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          업로드된 문서가 없습니다
        </div>
      )}
    </div>
  );
}
