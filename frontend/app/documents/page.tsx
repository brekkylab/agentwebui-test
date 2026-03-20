"use client";

import { useCallback, useState } from "react";
import { DocumentList } from "@/components/documents/document-list";
import {
  UploadButton,
  DragOverlay,
  useFileUpload,
} from "@/components/documents/upload-zone";

export default function DocumentsPage() {
  const [isDragging, setIsDragging] = useState(false);
  const { handleFiles } = useFileUpload();

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  return (
    <div
      className="p-6 max-w-3xl mx-auto h-full"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Documents</h1>
        <UploadButton />
      </div>
      <DocumentList />
      <DragOverlay isDragging={isDragging} />
    </div>
  );
}
