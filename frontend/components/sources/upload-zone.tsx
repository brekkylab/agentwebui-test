"use client";

import { useCallback, useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadSource } from "@/lib/api";

export function useFileUpload(onUploaded?: () => void) {
  const handleFiles = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        try {
          await uploadSource(file);
        } catch (error) {
          console.error("Upload failed:", error);
        }
      }
      onUploaded?.();
    },
    [onUploaded]
  );

  return { handleFiles };
}

export function UploadButton({ onUploaded }: { onUploaded?: () => void }) {
  const { handleFiles } = useFileUpload(onUploaded);
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
        <Upload className="h-4 w-4 mr-2" /> 소스 추가
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
