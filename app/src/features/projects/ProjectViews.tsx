import { Icon } from '../../components/Icon';
import { ActivityRow, AvatarStack, byId, compactTime, EmptyState, InfoRow, IntentIcon, SectionLabel, SharePill } from '../../components/uiPrimitives';
import type { AppState } from '../../domain/appState';
import type { Project, ProjectId, RouteKey, Session, SessionId } from '../../domain/types';

export function ProjectsPage({ state, openProject, openNewProject }: { state: AppState; openProject: (id: ProjectId) => void; openNewProject: () => void }) {
  return (
    <section className="cw-page cw-projects-page cw-page-enter">
      <div className="cw-page-head"><div><h1>Your projects</h1><p>Each project is a workspace. Sessions, files, members, skills, schedule — all live inside.</p></div><button className="cw-btn-primary" onClick={openNewProject}><Icon name="plus" /> New project</button></div>
      <SectionLabel>Projects · {state.projects.length} projects</SectionLabel>
      <div className="cw-project-grid">
        {state.projects.map((project) => {
          const sessions = state.sessions.filter((item) => item.projectId === project.id);
          const members = state.users.filter((user) => project.memberIds.includes(user.id));
          const isOwner = project.ownerId === state.currentUserId;
          const latest = sessions[0]?.updatedAt ?? 'new';
          return (
            <button key={project.id} className={`cw-project-card ${project.id === state.activeProjectId ? 'is-active' : ''}`} onClick={() => openProject(project.id)}>
              <div className="cw-project-card-head">
                <span className="cw-project-card-name"><Icon name={project.id === state.activeProjectId ? 'folder-open' : project.isPersonal ? 'home' : 'folder'} size={15} /><span>{project.name}</span></span>
                <span className={`cw-role-badge ${isOwner ? 'owner' : 'member'}`}>{isOwner ? 'Owner' : 'Member'}</span>
              </div>
              <p className="cw-project-card-desc">{project.description}</p>
              <div className="cw-project-card-footer"><AvatarStack users={members} /><span className="cw-card-stats">{sessions.length}개 세션 · {latest}</span></div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ProjectHome({ state, project, openSession, openNewSession, navigate }: { state: AppState; project: Project; openSession: (id: SessionId) => void; openNewSession: () => void; navigate: (route: RouteKey) => void }) {
  const sessions = state.sessions.filter((item) => item.projectId === project.id);
  const files = state.files.filter((file) => file.projectId === project.id);
  return (
    <section className="cw-page cw-page-enter">
      <div className="cw-project-hero"><div><h1>{project.name}</h1><p>{project.description}</p></div><div className="cw-hero-actions"><AvatarStack users={state.users.filter((user) => project.memberIds.includes(user.id))} /><button className="cw-btn-primary" onClick={openNewSession}><Icon name="plus" /> New session</button></div></div>
      <div className="cw-project-summary"><InfoRow icon="folder-open" title={`${files.length} files`} meta="ground truth">Project Files can be selected, pinned, and cited in sessions.</InfoRow><InfoRow icon="users" title={`${project.memberIds.length} members`} meta="access">Shared sessions show who can talk with Cowork.</InfoRow></div>
      <div className="cw-section-title"><SectionLabel>Sessions · {sessions.length} visible to you</SectionLabel><button onClick={() => navigate('schedule')}>schedule 자동 발화</button></div>
      {sessions.length ? <div className="cw-session-grid">{sessions.map((item) => <SessionCard key={item.id} session={item} state={state} onOpen={() => openSession(item.id)} />)}</div> : <EmptyState title="No sessions yet" body="Start a session to make this project self-serve." action="New session" onAction={openNewSession} />}
      <SectionLabel>Activity</SectionLabel>
      <div className="cw-activity-list"><ActivityRow title="주간 진행 정리" date="2026-05-11">5/4~5/10 {project.name} — Files와 Sessions의 mock state가 연결되어 있습니다.</ActivityRow><ActivityRow title="Ground truth ready" date="방금 전">선택된 Files는 Session의 referenced files와 Artifact evidence로 반영됩니다.</ActivityRow></div>
    </section>
  );
}

function SessionCard({ session, state, onOpen }: { session: Session; state: AppState; onOpen: () => void }) {
  const participants = state.users.filter((user) => user.id !== 'ai' && (session.shareMode === 'shared_chat' || user.id === session.creatorId));
  const last = lastMessagePreview(session, state);
  const unread = unreadCount(session.id);
  return (
    <button className={`cw-session-card ${unread ? 'is-unread' : ''}`} onClick={onOpen}>
      <div className="cw-session-card-head">
        <span className="cw-session-card-title"><IntentIcon intent={session.intent} force /><span>{session.title}</span></span>
        <SharePill mode={session.shareMode} compact />
      </div>
      <p className="cw-session-last"><span className="who">{last.who}:</span> {last.body}</p>
      <div className="cw-session-card-footer">
        <AvatarStack users={participants} />
        <span className="cw-session-right">
          {unread ? <span className="cw-unread-badge"><span className="dot" /><span className="n">{unread}</span></span> : <span className="cw-caught-up"><Icon name="check" size={11} /></span>}
          <span className="cw-card-time">{compactTime(session.updatedAt)}</span>
        </span>
      </div>
    </button>
  );
}

function lastMessagePreview(session: Session, state: AppState): { who: string; body: string } {
  const message = [...state.messages].reverse().find((item) => item.sessionId === session.id);
  if (!message) return { who: byId(state.users, session.creatorId).name.split(' ')[0], body: '새 session입니다. 선택한 Files를 ground truth로 붙여 시작할 수 있어요.' };
  return { who: message.senderId === 'ai' ? 'AI' : byId(state.users, message.senderId).name.split(' ')[0], body: excerpt(message.body) };
}

function unreadCount(sessionId: SessionId): number {
  const counts: Record<string, number> = {
    'sess-q2-start': 5,
    'sess-client-meeting': 1,
    'sess-gtm-launch': 3,
  };
  return counts[sessionId] ?? 0;
}

function excerpt(value: string): string {
  return value.replace(/\s+/g, ' ').slice(0, 92);
}
