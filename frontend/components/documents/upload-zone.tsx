"use client";

import { useCallback, useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import type { Document } from "@/lib/types";

export function useFileUpload() {
  const addDocument = useAppStore((s) => s.addDocument);

  const handleFiles = useCallback(
    (files: FileList) => {
      Array.from(files).forEach((file) => {
        const doc: Document = {
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          size: file.size,
          uploadedAt: new Date(),
        };
        addDocument(doc);
      });
    },
    [addDocument]
  );

  return { handleFiles };
}

export function UploadButton() {
  const { handleFiles } = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button onClick={() => fileInputRef.current?.click()}>
        <Upload className="h-4 w-4 mr-2" /> 문서 추가
      </Button>
    </>
  );
}

export function DragOverlay({ isDragging }: { isDragging: boolean }) {
  if (!isDragging) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="rounded-xl border-2 border-dashed border-primary p-12 text-center">
        <Upload className="mx-auto h-12 w-12 text-primary mb-4" />
        <p className="text-lg font-medium">여기에 파일을 놓으세요</p>
      </div>
    </div>
  );
}
