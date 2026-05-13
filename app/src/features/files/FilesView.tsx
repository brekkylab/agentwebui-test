import { useDeferredValue, useState } from 'react';
import { Icon } from '../../components/Icon';
import { FileIcon } from '../../components/fileComponents';
import { byId, EmptyState, IconPocket } from '../../components/uiPrimitives';
import type { AppState } from '../../domain/appState';
import { folderOf, getProjectFolders } from '../../domain/files';

export function FilesPage({ state, openFolderDialog, openUploadDialog, pinSelectedFiles, patch }: { state: AppState; openFolderDialog: () => void; openUploadDialog: () => void; pinSelectedFiles: () => void; patch: (fn: (prev: AppState) => AppState) => void }) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const project = byId(state.projects, state.activeProjectId);
  const folders = getProjectFolders(state.files, state.activeProjectId);
  const selectedFolder = folders.some((folder) => folder.key === state.selectedFolder) ? state.selectedFolder : folders[0]?.key ?? 'General';
  const files = state.files.filter((file) => file.projectId === state.activeProjectId && folderOf(file) === selectedFolder && `${file.name} ${file.summary}`.toLowerCase().includes(deferred.toLowerCase()));
  return (
    <section className="cw-page cw-files-page cw-page-enter">
      <div className="cw-page-head"><div><h1>Files</h1><p>Shared with the whole project. Select files, pin them to a session, then generate artifacts from those citations.</p></div><div><button className="cw-btn-secondary" onClick={openFolderDialog}><IconPocket tone="add" icon="plus" compact /> New folder</button><button className="cw-btn-primary" onClick={openUploadDialog}><IconPocket tone="add" icon="upload" compact /> Upload</button></div></div>
      <div className="cw-file-browser">
        <aside className="cw-folder-tree">
          <div className="cw-folder-root"><IconPocket tone="files" icon="folder" /> {project.name}</div>
          {folders.map((folder) => <button key={folder.key} className={selectedFolder === folder.key ? 'is-active' : ''} onClick={() => patch((prev) => ({ ...prev, selectedFolder: folder.key }))}><IconPocket tone="files" icon={selectedFolder === folder.key ? 'folder-open' : 'folder'} />{folder.label}<span>{folder.count}</span></button>)}
        </aside>
        <section className="cw-file-list">
          <div className="cw-file-path"><span><FileIcon file={{ id: 'folder-open', projectId: project.id, name: selectedFolder, path: `${project.name}/${selectedFolder}`, type: 'folder', sizeLabel: '', updatedAt: '', summary: '', groundTruth: [] }} compact /> <b>{selectedFolder}</b></span><label><IconPocket tone="search" icon="search" compact /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파일 검색" /></label></div>
          {files.length ? files.map((file) => (
            <button key={file.id} className={`cw-file-row ${state.selectedFileIds.includes(file.id) ? 'is-selected' : ''}`} onClick={() => patch((prev) => ({ ...prev, selectedFileIds: prev.selectedFileIds.includes(file.id) ? prev.selectedFileIds.filter((id) => id !== file.id) : [...prev.selectedFileIds, file.id] }))}>
              <FileIcon file={file} />
              <span className="cw-file-main"><span className="name">{file.name}</span><span className="meta">{file.summary} · {file.updatedAt} · {file.sizeLabel}</span></span>
              <span className="cw-file-more"><Icon name="more" size={14} /></span>
            </button>
          )) : <EmptyState title="No files match" body="Try another folder, clear the search, or upload a mock file." action="Upload file" onAction={openUploadDialog} />}
          <div className="cw-dropzone" onClick={openUploadDialog} role="button" tabIndex={0}><IconPocket tone="add" icon="plus" /><span>Drop files here or click Upload. Mock files become selectable ground truth immediately.</span></div>
          <div className="cw-knowledge"><h2><IconPocket tone="content" icon="sparkles" /> Knowledge <small>soon</small></h2><p>{state.selectedFileIds.length} selected files can be pinned as this session's ground truth. Files stay where they are — Knowledge is just an index over them.</p><button className="cw-btn-secondary" onClick={pinSelectedFiles} disabled={state.selectedFileIds.length === 0}>Pin selected files to session</button></div>
        </section>
      </div>
    </section>
  );
}
