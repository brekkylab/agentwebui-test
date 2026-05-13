import type { FileAsset, ProjectId } from './types';

export type FolderInfo = { key: string; label: string; count: number };

export function getProjectFolders(files: FileAsset[], projectId: ProjectId): FolderInfo[] {
  const counts = new Map<string, number>();
  files.filter((file) => file.projectId === projectId).forEach((file) => counts.set(folderOf(file), (counts.get(folderOf(file)) ?? 0) + 1));
  if (!counts.size) counts.set('General', 0);
  return [...counts.entries()].map(([key, count]) => ({ key, label: key, count }));
}

export function folderOf(file: FileAsset): string {
  const parts = file.path.split('/').filter(Boolean);
  return parts[1] ?? 'General';
}
