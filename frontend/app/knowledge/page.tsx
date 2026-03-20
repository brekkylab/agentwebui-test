"use client";

import { useState } from "react";
import { KnowledgeGrid } from "@/components/knowledge/knowledge-grid";
import { KnowledgeEditor } from "@/components/knowledge/knowledge-editor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/lib/store";

export default function KnowledgePage() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const addKnowledge = useAppStore((s) => s.addKnowledge);

  const handleCreate = () => {
    if (!newName.trim()) return;
    const id = `kn-${Date.now()}`;
    addKnowledge({
      id,
      name: newName.trim(),
      description: newDescription.trim(),
      documentIds: [],
    });
    setNewName("");
    setNewDescription("");
    setIsCreateOpen(false);
    setEditingId(id);
  };

  if (editingId) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <KnowledgeEditor
          knowledgeId={editingId}
          onBack={() => setEditingId(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <KnowledgeGrid
        onSelect={setEditingId}
        onCreate={() => setIsCreateOpen(true)}
      />

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 Knowledge 만들기</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">이름</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Knowledge 이름을 입력하세요"
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium">설명</label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="설명을 입력하세요"
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
            >
              취소
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              만들기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
