import type { Artifact, BootstrapPayload, FileAsset, Message, ProjectId, Session, SessionId, SessionIntent, ShareMode, UserId } from '../domain/types';

export interface CreateSessionInput {
  projectId: ProjectId;
  title: string;
  intent: SessionIntent;
  creatorId: UserId;
}

export interface SendMessageInput {
  sessionId: SessionId;
  senderId: UserId;
  body: string;
  referencedFileIds?: FileAsset['id'][];
}

export interface CoworkApi {
  getBootstrap(): Promise<BootstrapPayload>;
  createSession(input: CreateSessionInput): Promise<Session>;
  updateSessionShareMode(sessionId: SessionId, shareMode: ShareMode): Promise<Session>;
  sendMessage(input: SendMessageInput): Promise<{ userMessage: Message; aiMessage: Message }>;
  generateDecisionArtifact(sessionId: SessionId, fileIds: FileAsset['id'][]): Promise<Artifact>;
}

export interface LiveApiConfig {
  baseUrl: string;
  tokenProvider: () => string | null;
}

export function createLiveApi(_config: LiveApiConfig): CoworkApi {
  throw new Error('Live API adapter placeholder: wire to backend-v2 endpoints when available. The app is currently using mockApi with the same interface.');
}
