import { Icon } from '../../components/Icon';
import { ArtifactPreview, Evidence, FileTiny } from '../../components/fileComponents';
import { Avatar, byId, EmptyState, IconPocket, IntentBadge, SharePill, ShareSelect } from '../../components/uiPrimitives';
import type { AppState } from '../../domain/appState';
import { shareMeta } from '../../domain/metadata';
import type { Artifact, Message, Session, ShareMode } from '../../domain/types';

export function SessionPage({ state, session, messages, artifact, sendMessage, generateArtifact, updateShareMode, patch }: { state: AppState; session: Session; messages: Message[]; artifact?: Artifact; sendMessage: () => void; generateArtifact: () => void; updateShareMode: (mode: ShareMode) => void; patch: (fn: (prev: AppState) => AppState) => void }) {
  return (
    <div className="cw-session-layout cw-page-enter">
      <section className="cw-chat-surface">
        <div className="cw-chat-head"><div><h1>{session.title}</h1><p>Started by <Avatar user={byId(state.users, session.creatorId)} small /> {byId(state.users, session.creatorId).name} · {session.references.length} files · <Avatar user={byId(state.users, 'ai')} small /> Cowork Default</p></div><div className="cw-session-head-actions"><IntentBadge intent={session.intent} /><ShareSelect mode={session.shareMode} onChange={updateShareMode} /></div></div>
        <div className="cw-messages">{messages.length ? messages.map((message) => <MessageBubble key={message.id} message={message} state={state} />) : <EmptyState title="Start this session" body="Send a message and Cowork will cite the selected project files." />}{state.isThinking && <div className="cw-live"><span />응답 받는 중…</div>}</div>
        <form className="cw-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
          <div className="cw-composer-box">
            <input value={state.composerText} onChange={(event) => patch((prev) => ({ ...prev, composerText: event.target.value }))} placeholder="Message Cowork and the team…" />
            <button type="submit" className="cw-send-button" aria-label="Send" disabled={!state.composerText.trim() || state.isThinking}><Icon name="send" size={12} /></button>
          </div>
          <button type="button" className="cw-btn-secondary cw-artifact-button" onClick={generateArtifact} disabled={state.isThinking}><IconPocket tone="trust" icon="artifact" compact /> Artifact</button>
          <small>Enter to send · Reference files with @filename · {state.selectedFileIds.length} selected files</small>
        </form>
      </section>
      <aside className="cw-session-side"><h3>Members</h3>{state.users.filter((user) => user.id !== 'ai').map((user) => <div className="cw-side-row" key={user.id}><Avatar user={user} small />{user.name}</div>)}<h3>Referenced files</h3>{session.references.length ? session.references.map((id) => <FileTiny key={id} file={byId(state.files, id)} />) : <p>No pinned files yet.</p>}<h3>Access</h3><SharePill mode={session.shareMode} /><p>{shareMeta[session.shareMode].desc}</p>{artifact && <ArtifactPreview artifact={artifact} files={state.files} />}</aside>
    </div>
  );
}

function MessageBubble({ message, state }: { message: Message; state: AppState }) {
  const user = byId(state.users, message.senderId);
  const isAi = message.senderId === 'ai';
  const isSelf = message.senderId === state.currentUserId;
  return (
    <article className={`cw-message ${isAi ? 'is-ai' : isSelf ? 'is-self' : 'is-other'}`}>
      {isAi ? <span className="cw-ai-chip">CW</span> : <Avatar user={user} />}
      <div className="cw-message-body">
        <div className="cw-message-meta"><b>{isSelf ? `${user.name.split(' ')[0]} · 나` : isAi ? 'AI' : user.name.split(' ')[0]}</b>{isAi && <span>{message.status === 'done' ? 'Cowork Default' : 'agent'}</span>}<time>{message.createdAt}</time></div>
        <div className={isAi ? 'cw-ai-prose' : 'cw-message-bubble'}>{message.body.split('\n').map((line, index) => <p key={`${message.id}-${index}`}>{line || '\u00a0'}</p>)}</div>
        {message.citations?.length ? <Evidence ids={message.citations} files={state.files} /> : null}
        {isAi && <div className="cw-ai-actions"><button>Copy</button><button>Regenerate</button><button>Good</button></div>}
      </div>
    </article>
  );
}
