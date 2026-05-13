import type { BootstrapPayload, ProjectId, RouteKey, SchedulePreview, SessionId, SkillPreview } from './types';

export type DialogKind = 'project' | 'session' | 'folder' | 'upload' | 'skill' | 'schedule' | null;
export type DialogContext = { skillId?: string; scheduleId?: string };

export type SkillFormInput = Omit<SkillPreview, 'id' | 'projectId' | 'createdBy' | 'createdAt' | 'updatedAt'>;
export type ScheduleFormInput = Omit<SchedulePreview, 'id' | 'projectId' | 'active' | 'createdBy' | 'createdAt'>;

export interface AppState extends BootstrapPayload {
  route: RouteKey;
  activeProjectId: ProjectId;
  activeSessionId: SessionId;
  authMode: 'login' | 'signup';
  activeDialog: DialogKind;
  dialogContext?: DialogContext;
  selectedFileIds: string[];
  selectedFolder: string;
  composerText: string;
  isThinking: boolean;
  apiMode: 'mock' | 'live-ready';
  notice?: string;
}
