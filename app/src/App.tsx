import { startTransition, useEffect, useState } from 'react';
import logoMark from './assets/logo-mark.svg';
import type { ActivityEntry, BootstrapPayload, FileAsset, Message, Project, ProjectId, RouteKey, SchedulePreview, Session, SessionId, SessionIntent, ShareMode, SkillPreview } from './domain/types';
import { buildScheduleRunReply, buildSkillRunReply, resolveScheduleTrigger, scheduleRunTimestamp } from './domain/capabilities';
import { createMockApi } from './services/mockApi';
import { Icon } from './components/Icon';
import { Avatar, byId, IconPocket, IntentIcon, SectionLabel } from './components/uiPrimitives';
import { intentMeta, shareMeta } from './domain/metadata';
import type { AppState, DialogContext, DialogKind, ScheduleFormInput, SkillFormInput } from './domain/appState';
import { ScheduleDialog, SchedulePage, SkillDialog, SkillsPage } from './features/capabilities/CapabilitiesViews';

import { getProjectFolders } from './domain/files';
import { ProjectDialog, NewSessionDialog, TextDialog } from './features/dialogs/AppDialogs';
import { FilesPage } from './features/files/FilesView';
import { AuthMock, DemoGuide, MembersPage, SettingsPage } from './features/misc/MiscViews';
import { ProjectHome, ProjectsPage } from './features/projects/ProjectViews';
import { SessionPage } from './features/sessions/SessionViews';

const api = createMockApi();

function initialState(data: BootstrapPayload): AppState {
  return {
    ...data,
    route: 'projects',
    activeProjectId: 'klientco',
    activeSessionId: 'sess-q2-start',
    authMode: 'login',
    activeDialog: null,
    dialogContext: undefined,
    selectedFileIds: ['file-market', 'file-competitor'],
    selectedFolder: 'Market research',
    composerText: '',
    isThinking: false,
    apiMode: 'mock',
  };
}

export function App() {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    let alive = true;
    api.getBootstrap().then((data) => {
      if (alive) setState(initialState(data));
    });
    return () => { alive = false; };
  }, []);

  if (!state) return <LoadingScreen />;
  const appState = state;

  function patch(update: (prev: AppState) => AppState) {
    setState((prev) => (prev ? update(prev) : prev));
  }

  function transitionPatch(update: (prev: AppState) => AppState) {
    startTransition(() => patch(update));
  }

  function navigate(route: RouteKey) {
    transitionPatch((prev) => ({ ...prev, route, notice: undefined }));
  }

  function openProject(projectId: ProjectId) {
    transitionPatch((prev) => {
      const nextSession = prev.sessions.find((session) => session.projectId === projectId)?.id ?? prev.activeSessionId;
      const folders = getProjectFolders(prev.files, projectId);
      return {
        ...prev,
        activeProjectId: projectId,
        activeSessionId: nextSession,
        selectedFolder: folders[0]?.key ?? 'General',
        selectedFileIds: prev.files.filter((file) => file.projectId === projectId).slice(0, 2).map((file) => file.id),
        route: 'project',
        notice: undefined,
      };
    });
  }

  function openSession(sessionId: SessionId) {
    transitionPatch((prev) => ({ ...prev, activeSessionId: sessionId, route: 'session', notice: undefined }));
  }

  function openDialog(activeDialog: DialogKind, dialogContext?: DialogContext) {
    patch((prev) => ({ ...prev, activeDialog, dialogContext, notice: undefined }));
  }

  async function updateShareMode(mode: ShareMode) {
    const updated = await api.updateSessionShareMode(appState.activeSessionId, mode);
    patch((prev) => ({ ...prev, sessions: prev.sessions.map((session) => session.id === updated.id ? updated : session), notice: `Access changed to ${shareMeta[mode].label}` }));
  }

  async function createSession(intent: SessionIntent, title?: string) {
    const created = await api.createSession({ projectId: appState.activeProjectId, title: title || `${intentMeta[intent].label} session`, intent, creatorId: appState.currentUserId });
    patch((prev) => ({ ...prev, sessions: [created, ...prev.sessions], activeSessionId: created.id, route: 'session', activeDialog: null, dialogContext: undefined, notice: '새 Session을 mock state에 만들었어요.' }));
  }

  function createProject(input: { name: string; description: string }) {
    patch((prev) => {
      const id = slugify(input.name || `project-${Date.now()}`);
      const project: Project = {
        id,
        name: input.name || 'Untitled project',
        description: input.description || '새 mock project workspace',
        ownerId: prev.currentUserId,
        memberIds: ['olive', 'milo'],
      };
      const session: Session = {
        id: `sess-${id}-kickoff`,
        projectId: id,
        title: `${project.name} kickoff`,
        creatorId: prev.currentUserId,
        shareMode: 'shared_chat',
        intent: 'general',
        model: 'Cowork Default',
        updatedAt: '방금 전',
        references: [`file-${id}-brief`],
      };
      const file: FileAsset = {
        id: `file-${id}-brief`,
        projectId: id,
        name: `${project.name} brief.md`,
        path: `${project.name}/Inbox/${project.name} brief.md`,
        type: 'doc',
        sizeLabel: '18 KB',
        updatedAt: todayLabel(),
        summary: 'Mock project brief created locally.',
        groundTruth: ['Created in mock state', 'Ready for session references'],
      };
      return {
        ...prev,
        projects: [...prev.projects, project],
        sessions: [session, ...prev.sessions],
        files: [file, ...prev.files],
        activeProjectId: id,
        activeSessionId: session.id,
        selectedFolder: 'Inbox',
        selectedFileIds: [file.id],
        route: 'project',
        activeDialog: null,
        dialogContext: undefined,
        notice: '새 Project가 mock workspace로 추가됐어요.',
      };
    });
  }

  function createFolder(name: string) {
    patch((prev) => {
      const project = byId(prev.projects, prev.activeProjectId);
      const folderName = name.trim() || 'New folder';
      const id = `file-folder-${slugify(folderName)}-${Date.now()}`;
      const folder: FileAsset = {
        id,
        projectId: prev.activeProjectId,
        name: `${folderName}/`,
        path: `${project.name}/${folderName}/${folderName}/`,
        type: 'folder',
        sizeLabel: '0 items',
        updatedAt: todayLabel(),
        summary: 'Locally created mock folder.',
        groundTruth: ['Folder exists in mock state'],
      };
      return { ...prev, files: [folder, ...prev.files], selectedFolder: folderName, selectedFileIds: [id], activeDialog: null, dialogContext: undefined, notice: `${folderName} folder를 만들었어요.` };
    });
  }

  function uploadMockFile(name: string) {
    patch((prev) => {
      const project = byId(prev.projects, prev.activeProjectId);
      const fileName = name.trim() || 'Uploaded research note.md';
      const id = `file-upload-${Date.now()}`;
      const file: FileAsset = {
        id,
        projectId: prev.activeProjectId,
        name: fileName,
        path: `${project.name}/${prev.selectedFolder}/${fileName}`,
        type: fileName.endsWith('.xlsx') ? 'sheet' : fileName.endsWith('.png') ? 'image' : fileName.endsWith('.pdf') ? 'pdf' : 'doc',
        sizeLabel: '24 KB',
        updatedAt: todayLabel(),
        summary: 'Uploaded into the local mock adapter.',
        groundTruth: ['Mock upload complete', 'Available for AI citations'],
      };
      return { ...prev, files: [file, ...prev.files], selectedFileIds: [...new Set([file.id, ...prev.selectedFileIds])], activeDialog: null, dialogContext: undefined, notice: `${fileName} uploaded to mock Files.` };
    });
  }

  async function sendMessage() {
    const body = appState.composerText.trim();
    if (!body || appState.isThinking) return;
    const referencedFileIds = appState.selectedFileIds.filter((id) => appState.files.some((file) => file.id === id));
    patch((prev) => ({ ...prev, isThinking: true, composerText: '', notice: undefined }));
    const result = await api.sendMessage({ sessionId: appState.activeSessionId, senderId: appState.currentUserId, body, referencedFileIds });
    patch((prev) => ({
      ...prev,
      messages: [...prev.messages, result.userMessage, result.aiMessage],
      sessions: prev.sessions.map((session) => session.id === appState.activeSessionId ? { ...session, references: [...new Set([...session.references, ...referencedFileIds])], updatedAt: '방금 전' } : session),
      isThinking: false,
    }));
  }

  async function generateArtifact() {
    if (appState.isThinking) return;
    const fileIds = appState.selectedFileIds.length ? appState.selectedFileIds : appState.sessions.find((session) => session.id === appState.activeSessionId)?.references ?? [];
    patch((prev) => ({ ...prev, isThinking: true, notice: undefined }));
    const artifact = await api.generateDecisionArtifact(appState.activeSessionId, fileIds);
    patch((prev) => ({
      ...prev,
      artifacts: [artifact, ...prev.artifacts.filter((item) => item.id !== artifact.id)],
      sessions: prev.sessions.map((session) => session.id === prev.activeSessionId ? { ...session, artifactId: artifact.id, references: fileIds } : session),
      isThinking: false,
      notice: '파일 근거 기반 artifact를 생성했어요.',
    }));
  }

  function pinSelectedFiles() {
    patch((prev) => {
      const selected = prev.selectedFileIds.filter((id) => prev.files.some((file) => file.id === id && file.projectId === prev.activeProjectId));
      const targetSessionId = prev.sessions.find((session) => session.projectId === prev.activeProjectId)?.id ?? prev.activeSessionId;
      return {
        ...prev,
        activeSessionId: targetSessionId,
        sessions: prev.sessions.map((session) => session.id === targetSessionId ? { ...session, references: selected, updatedAt: '방금 전' } : session),
        route: 'session',
        notice: `${selected.length}개 file을 session ground truth로 pin했어요.`,
      };
    });
  }

  function createSkill(input: SkillFormInput) {
    patch((prev) => {
      const skill: SkillPreview = {
        id: `skill-${Date.now()}`,
        projectId: prev.activeProjectId,
        createdBy: prev.currentUserId,
        createdAt: todayLabel(),
        updatedAt: todayLabel(),
        ...input,
      };
      return { ...prev, skills: [skill, ...prev.skills], activeDialog: null, dialogContext: undefined, notice: `Skill "${skill.name}" 생성됨` };
    });
  }

  function updateSkill(skillId: string, input: SkillFormInput) {
    patch((prev) => ({
      ...prev,
      skills: prev.skills.map((skill) => skill.id === skillId ? { ...skill, ...input, updatedAt: todayLabel() } : skill),
      activeDialog: null,
      dialogContext: undefined,
      notice: 'Skill 저장됨',
    }));
  }

  function deleteSkill(skillId: string) {
    patch((prev) => ({ ...prev, skills: prev.skills.filter((skill) => skill.id !== skillId), notice: 'Skill 삭제됨' }));
  }

  async function copySkillMention(skill: SkillPreview) {
    const mention = `@${skill.name}`;
    const copied = await writeClipboardText(mention);
    patch((prev) => ({ ...prev, notice: copied ? `${mention} 복사됨` : `클립보드 권한 없음 — ${mention}을 직접 복사하세요` }));
  }

  function runSkill(skillId: string) {
    patch((prev) => {
      const skill = prev.skills.find((item) => item.id === skillId);
      if (!skill || !skill.runnable) return { ...prev, notice: 'Runnable skill만 실행할 수 있어요.' };
      const sessionId = `sess-skill-${Date.now()}`;
      const promptText = skill.promptTemplate || skill.description;
      const session: Session = {
        id: sessionId,
        projectId: skill.projectId,
        title: `${skill.name} · 실행`,
        creatorId: prev.currentUserId,
        shareMode: 'private',
        intent: skill.defaultIntent || 'general',
        model: 'Cowork Default',
        updatedAt: '방금 전',
        references: prev.selectedFileIds.filter((id) => prev.files.some((file) => file.projectId === skill.projectId && file.id === id)),
      };
      const userMessage: Message = { id: `msg-skill-user-${Date.now()}`, sessionId, senderId: prev.currentUserId, createdAt: '지금', body: promptText };
      const aiMessage: Message = { id: `msg-skill-ai-${Date.now()}`, sessionId, senderId: 'ai', createdAt: '지금', body: buildSkillRunReply(skill), status: 'done' };
      return {
        ...prev,
        sessions: [session, ...prev.sessions],
        messages: [...prev.messages, userMessage, aiMessage],
        activeProjectId: skill.projectId,
        activeSessionId: sessionId,
        route: 'session',
        notice: `▶ ${skill.name} 실행 — 새 session 생성됨`,
      };
    });
  }

  function createSchedule(input: ScheduleFormInput) {
    patch((prev) => {
      const schedule: SchedulePreview = {
        id: `sched-${Date.now()}`,
        projectId: prev.activeProjectId,
        active: true,
        createdBy: prev.currentUserId,
        createdAt: todayLabel(),
        ...input,
      };
      return { ...prev, schedules: [schedule, ...prev.schedules], activeDialog: null, dialogContext: undefined, notice: `Schedule 등록됨 — ${schedule.friendlyTime}` };
    });
  }

  function updateSchedule(scheduleId: string, input: ScheduleFormInput) {
    patch((prev) => ({
      ...prev,
      schedules: prev.schedules.map((schedule) => schedule.id === scheduleId ? { ...schedule, ...input } : schedule),
      activeDialog: null,
      dialogContext: undefined,
      notice: 'Schedule 저장됨',
    }));
  }

  function toggleSchedule(scheduleId: string) {
    patch((prev) => ({
      ...prev,
      schedules: prev.schedules.map((schedule) => schedule.id === scheduleId ? { ...schedule, active: !schedule.active, nextRunAt: schedule.active ? '일시정지됨' : schedule.nextRunAt === '일시정지됨' ? `${schedule.friendlyTime} (재개됨)` : schedule.nextRunAt } : schedule),
    }));
  }

  function deleteSchedule(scheduleId: string) {
    patch((prev) => ({ ...prev, schedules: prev.schedules.filter((schedule) => schedule.id !== scheduleId), notice: 'Schedule 삭제됨' }));
  }

  function runScheduleNow(scheduleId: string) {
    patch((prev) => {
      const schedule = prev.schedules.find((item) => item.id === scheduleId);
      if (!schedule) return prev;
      const resolved = resolveScheduleTrigger(schedule, prev.skills);
      if (!resolved) return { ...prev, notice: 'Skill이 삭제되어 실행 불가' };
      const stampedPrompt = `── ${scheduleRunTimestamp()} · schedule 발화 ──\n\n${resolved.prompt}`;
      if (schedule.resultTarget.kind === 'new_session_each_time') {
        const sessionId = `sess-schedule-${Date.now()}`;
        const session: Session = {
          id: sessionId,
          projectId: schedule.projectId,
          title: `${resolved.title} · 자동 발화`,
          creatorId: schedule.createdBy,
          shareMode: schedule.resultSessionShareMode || 'shared_chat',
          intent: resolved.intent,
          model: 'Cowork Default',
          updatedAt: '방금 전',
          references: [],
        };
        const userMessage: Message = { id: `msg-schedule-user-${Date.now()}`, sessionId, senderId: schedule.createdBy, createdAt: '지금', body: stampedPrompt };
        const aiMessage: Message = { id: `msg-schedule-ai-${Date.now()}`, sessionId, senderId: 'ai', createdAt: '지금', body: buildScheduleRunReply(resolved.title), status: 'done' };
        return {
          ...prev,
          sessions: [session, ...prev.sessions],
          messages: [...prev.messages, userMessage, aiMessage],
          activeProjectId: schedule.projectId,
          activeSessionId: sessionId,
          route: 'session',
          notice: '▶ Schedule 발화 — 새 session 생성됨',
        };
      }
      if (schedule.resultTarget.kind === 'append_to_session') {
        const targetId = schedule.resultTarget.sessionId;
        const target = prev.sessions.find((session) => session.id === targetId);
        if (!target) return { ...prev, notice: '대상 session이 없어 누적할 수 없어요.' };
        const message: Message = { id: `msg-schedule-append-${Date.now()}`, sessionId: targetId, senderId: schedule.createdBy, createdAt: '지금', body: stampedPrompt };
        return {
          ...prev,
          messages: [...prev.messages, message],
          sessions: prev.sessions.map((session) => session.id === targetId ? { ...session, updatedAt: '방금 전', isAutoAppend: true } : session),
          activeProjectId: schedule.projectId,
          activeSessionId: targetId,
          route: 'session',
          notice: `▶ Schedule 발화 — "${target.title}"에 누적`,
        };
      }
      const entry: ActivityEntry = { id: `act-${Date.now()}`, projectId: schedule.projectId, scheduleId: schedule.id, occurredAt: '지금', title: resolved.title, body: resolved.prompt };
      return { ...prev, activityFeed: [entry, ...prev.activityFeed], notice: '▶ Activity feed에 1줄 추가됨' };
    });
  }

  const project = byId(state.projects, appState.activeProjectId);
  const session = byId(state.sessions, appState.activeSessionId);
  const messages = state.messages.filter((message) => message.sessionId === session.id);
  const artifact = state.artifacts.find((item) => item.id === session.artifactId) ?? state.artifacts.find((item) => item.sessionId === session.id);

  return (
    <div className="cw-app-shell">
      <Sidebar state={state} project={project} session={session} navigate={navigate} openProject={openProject} openSession={openSession} openNewProject={() => openDialog('project')} openNewSession={() => openDialog('session')} />
      <main className="cw-main-shell main">
        {state.notice && <div className="cw-toast" role="status"><Icon name="check" />{state.notice}</div>}
        {state.route === 'projects' && <ProjectsPage state={state} openProject={openProject} openNewProject={() => openDialog('project')} />}
        {state.route === 'project' && <ProjectHome state={state} project={project} openSession={openSession} openNewSession={() => openDialog('session')} navigate={navigate} />}
        {state.route === 'session' && <SessionPage state={state} session={session} messages={messages} artifact={artifact} sendMessage={sendMessage} generateArtifact={generateArtifact} updateShareMode={updateShareMode} patch={patch} />}
        {state.route === 'files' && <FilesPage state={state} openFolderDialog={() => openDialog('folder')} openUploadDialog={() => openDialog('upload')} pinSelectedFiles={pinSelectedFiles} patch={patch} />}
        {state.route === 'skills' && <SkillsPage state={state} openSkillDialog={(skillId) => openDialog('skill', { skillId })} deleteSkill={deleteSkill} runSkill={runSkill} copySkillMention={copySkillMention} />}
        {state.route === 'schedule' && <SchedulePage state={state} openScheduleDialog={(scheduleId) => openDialog('schedule', { scheduleId })} toggleSchedule={toggleSchedule} deleteSchedule={deleteSchedule} runScheduleNow={runScheduleNow} />}
        {state.route === 'members' && <MembersPage state={state} />}
        {state.route === 'settings' && <SettingsPage state={state} />}
        {state.route === 'auth' && <AuthMock state={state} patch={patch} />}
        {state.route === 'demo' && <DemoGuide navigate={navigate} />}
      </main>
      {state.activeDialog === 'project' && <ProjectDialog onClose={() => openDialog(null)} onCreate={createProject} />}
      {state.activeDialog === 'session' && <NewSessionDialog onClose={() => openDialog(null)} onCreate={createSession} />}
      {state.activeDialog === 'folder' && <TextDialog title="New folder" label="Folder name" defaultValue="Field notes" action="Create folder" onClose={() => openDialog(null)} onSubmit={createFolder} />}
      {state.activeDialog === 'upload' && <TextDialog title="Mock upload" label="File name" defaultValue="Uploaded research note.md" action="Upload file" onClose={() => openDialog(null)} onSubmit={uploadMockFile} />}
      {state.activeDialog === 'skill' && <SkillDialog state={state} skillId={state.dialogContext?.skillId} onClose={() => openDialog(null)} onCreate={createSkill} onUpdate={updateSkill} />}
      {state.activeDialog === 'schedule' && <ScheduleDialog state={state} scheduleId={state.dialogContext?.scheduleId} onClose={() => openDialog(null)} onCreate={createSchedule} onUpdate={updateSchedule} />}
    </div>
  );
}

function LoadingScreen() {
  return <div className="cw-loading"><img src={logoMark} alt="" /><span>Cowork를 여는 중…</span></div>;
}

function Sidebar({ state, project, session, navigate, openProject, openSession, openNewProject, openNewSession }: { state: AppState; project: Project; session: Session; navigate: (route: RouteKey) => void; openProject: (id: ProjectId) => void; openSession: (id: SessionId) => void; openNewProject: () => void; openNewSession: () => void }) {
  const projectSessions = state.sessions.filter((item) => item.projectId === project.id);
  return (
    <aside className="cw-sidebar-app">
      <button className="cw-brand-lockup" onClick={() => navigate('projects')} aria-label="Cowork projects"><img src={logoMark} alt="" /><strong>Cowork</strong></button>
      <SectionLabel>Projects</SectionLabel>
      <nav className="cw-nav-list">
        {state.projects.map((item) => <button key={item.id} className={`cw-nav-row cw-project-nav-row ${item.id === project.id ? 'is-active' : ''}`} onClick={() => openProject(item.id)}><span className="cw-project-swatch" /> <span>{item.name}</span></button>)}
        <button className="cw-nav-row is-ghost" onClick={openNewProject}><span className="cw-project-swatch is-plus">+</span><span>새 Project</span></button>
      </nav>
      <div className="cw-project-block">
        <div className="cw-project-name">{project.name}</div>
        <button className={`cw-nav-row ${state.route === 'project' ? 'is-active' : ''}`} onClick={() => navigate('project')}><IconPocket tone="home" icon="home" /> Home</button>
        <button className={`cw-nav-row ${state.route === 'files' ? 'is-active' : ''}`} onClick={() => navigate('files')}><IconPocket tone="files" icon="folder-open" /> Files</button>
        <button className={`cw-nav-row ${state.route === 'skills' ? 'is-active' : ''}`} onClick={() => navigate('skills')}><IconPocket tone="skills" icon="zap" /> Skills</button>
        <button className={`cw-nav-row ${state.route === 'schedule' ? 'is-active' : ''}`} onClick={() => navigate('schedule')}><IconPocket tone="schedule" icon="calendar" /> Schedule</button>
        <button className={`cw-nav-row ${state.route === 'members' ? 'is-active' : ''}`} onClick={() => navigate('members')}><IconPocket tone="members" icon="users" /> Members</button>
        <button className={`cw-nav-row ${state.route === 'settings' ? 'is-active' : ''}`} onClick={() => navigate('settings')}><IconPocket tone="settings" icon="settings" /> Settings</button>
      </div>
      <SectionLabel>Sessions</SectionLabel>
      <div className="cw-session-rail">
        {projectSessions.map((item) => <button key={item.id} className={`cw-session-row ${item.id === session.id ? 'is-active' : ''}`} onClick={() => openSession(item.id)}><IntentIcon intent={item.intent} force /><span>{item.title}</span>{item.id === 'sess-decision-thread' && <span className="auto-dot">↻</span>}</button>)}
        {projectSessions.length === 0 && <div className="cw-empty-mini">No sessions yet</div>}
        <button className="cw-session-row is-new" onClick={openNewSession}><Icon name="plus" /> 새 Session</button>
      </div>
      <div className="cw-sidebar-user"><Avatar user={byId(state.users, state.currentUserId)} /><div><b>{byId(state.users, state.currentUserId).name.split(' ')[0]}</b><span>{byId(state.users, state.currentUserId).email}</span></div><Icon name="more" /></div>
    </aside>
  );
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '') || `mock-${Date.now()}`;
}

async function writeClipboardText(value: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function todayLabel(): string {
  return '2026-05-13';
}
