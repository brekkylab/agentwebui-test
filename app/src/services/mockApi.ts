import { seed } from '../data/seed';
import type { Artifact, Message, Session } from '../domain/types';
import type { CoworkApi, CreateSessionInput, SendMessageInput } from './coworkApi';

function wait<T>(value: T, ms = 180): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));
}

export function createMockApi(): CoworkApi {
  let sessions = structuredClone(seed.sessions);
  let messages = structuredClone(seed.messages);
  let artifacts = structuredClone(seed.artifacts);

  return {
    getBootstrap: () => wait({ ...seed, sessions, messages, artifacts }, 260),

    async createSession(input: CreateSessionInput) {
      const session: Session = {
        id: `sess-${Date.now()}`,
        projectId: input.projectId,
        title: input.title || '새 Session',
        creatorId: input.creatorId,
        shareMode: 'private',
        intent: input.intent,
        model: 'Claude Opus 4.7',
        updatedAt: '방금 전',
        references: [],
      };
      sessions = [session, ...sessions];
      return wait(session);
    },

    async updateSessionShareMode(sessionId, shareMode) {
      sessions = sessions.map((session) => session.id === sessionId ? { ...session, shareMode } : session);
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) throw new Error('Session not found');
      return wait(session);
    },

    async sendMessage(input: SendMessageInput) {
      const userMessage: Message = {
        id: `msg-user-${Date.now()}`,
        sessionId: input.sessionId,
        senderId: input.senderId,
        createdAt: '지금',
        body: input.body,
        citations: input.referencedFileIds,
      };
      const aiMessage: Message = {
        id: `msg-ai-${Date.now()}`,
        sessionId: input.sessionId,
        senderId: 'ai',
        createdAt: '지금',
        body: input.referencedFileIds?.length
          ? '첨부된 project Files를 ground truth로 읽고 답변할게요. 근거가 약한 부분은 추정으로 분리해서 표시하겠습니다.'
          : '좋아요. 이 session의 현재 intent와 공유 모드에 맞춰 이어서 도와드릴게요.',
        citations: input.referencedFileIds,
        status: 'done',
      };
      messages = [...messages, userMessage, aiMessage];
      return wait({ userMessage, aiMessage }, 320);
    },

    async generateDecisionArtifact(sessionId, fileIds) {
      const artifact: Artifact = {
        id: `artifact-${Date.now()}`,
        sessionId,
        title: '파일 근거 기반 결정 기록',
        kind: 'team_decision_record',
        status: 'ready',
        generatedFromFileIds: fileIds,
        sections: [
          { label: '결정', body: 'SMB retention 회복을 이번 제안서의 1순위 메시지로 둔다.', evidence: fileIds },
          { label: '근거', body: 'Files의 시장/매출/인터뷰 근거가 모두 activation proof와 renewal 방어를 가리킨다.', evidence: fileIds },
          { label: '다음 확인', body: 'enterprise expansion은 별도 appendix로 분리하고, 본문에서는 proof-led onboarding을 강조한다.', evidence: fileIds },
        ],
        nextActions: ['근거 chart 첨부', 'client-facing wording 정리', '다음 session에서 one-pager 초안 작성'],
      };
      artifacts = [artifact, ...artifacts];
      sessions = sessions.map((session) => session.id === sessionId ? { ...session, artifactId: artifact.id } : session);
      return wait(artifact, 420);
    },
  };
}
