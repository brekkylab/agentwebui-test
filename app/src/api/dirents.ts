import { request } from './client';
import type { BackendDirent } from './backend-types';
import { toFileAsset } from './transformers';
import type { FileAsset } from '@/domain/types';

export async function listDirents(projectId: string, projectName: string, recursive = true): Promise<FileAsset[]> {
  const res = await request<{ entries: BackendDirent[] }>(
    `/projects/${projectId}/dirents?recursive=${recursive}`,
  );
  return res.entries.map((e) => toFileAsset(e, projectId, projectName));
}

export async function uploadFile(projectId: string, file: File, targetPath: string): Promise<void> {
  const form = new FormData();
  const renamed = new File([file], targetPath, { type: file.type });
  form.append('file', renamed);
  await request(`/projects/${projectId}/dirents`, { method: 'POST', body: form, isForm: true });
}

export async function createFolder(projectId: string, folderPath: string): Promise<void> {
  const cleaned = folderPath.replace(/^\/+|\/+$/g, '');
  const placeholder = new File([''], `${cleaned}/.keep`, { type: 'text/plain' });
  const form = new FormData();
  form.append('file', placeholder);
  await request(`/projects/${projectId}/dirents`, { method: 'POST', body: form, isForm: true });
}
