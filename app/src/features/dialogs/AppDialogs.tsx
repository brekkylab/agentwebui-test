import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { IntentIcon, SectionLabel } from '../../components/uiPrimitives';
import { intentMeta } from '../../domain/metadata';
import type { SessionIntent } from '../../domain/types';

export function ProjectDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (input: { name: string; description: string }) => void }) {
  const [name, setName] = useState('Launch research room');
  const [description, setDescription] = useState('Self-serve mock workspace with files, sessions, and members.');

  return (
    <div className="cw-dialog-backdrop">
      <section className="cw-dialog">
        <button className="cw-close" onClick={onClose}><Icon name="x" /></button>
        <SectionLabel>Project</SectionLabel>
        <h2>새 Project 만들기</h2>
        <label className="cw-field">Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="cw-field">Description<input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <button className="cw-btn-primary wide" onClick={() => onCreate({ name, description })}>Create mock project</button>
      </section>
    </div>
  );
}

export function NewSessionDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (intent: SessionIntent, title?: string) => void }) {
  const [intent, setIntent] = useState<SessionIntent>('analysis');
  const [title, setTitle] = useState('');

  return (
    <div className="cw-dialog-backdrop">
      <section className="cw-dialog">
        <button className="cw-close" onClick={onClose}><Icon name="x" /></button>
        <SectionLabel>Intent start</SectionLabel>
        <h2>새 Session의 작업 성격을 고르세요</h2>
        <label className="cw-field">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`${intentMeta[intent].label} session`} /></label>
        <div className="cw-intent-grid">
          {(Object.keys(intentMeta) as SessionIntent[]).map((key) => (
            <button key={key} className={intent === key ? 'is-active' : ''} onClick={() => setIntent(key)}>
              <IntentIcon intent={key} force />
              <b>{intentMeta[key].label}</b>
              <span>{intentMeta[key].note}</span>
            </button>
          ))}
        </div>
        <button className="cw-btn-primary wide" onClick={() => onCreate(intent, title.trim() || undefined)}>Session 만들기</button>
      </section>
    </div>
  );
}

export function TextDialog({ title, label, defaultValue, action, onClose, onSubmit }: { title: string; label: string; defaultValue: string; action: string; onClose: () => void; onSubmit: (value: string) => void }) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="cw-dialog-backdrop">
      <section className="cw-dialog">
        <button className="cw-close" onClick={onClose}><Icon name="x" /></button>
        <SectionLabel>Mock action</SectionLabel>
        <h2>{title}</h2>
        <label className="cw-field">{label}<input value={value} onChange={(event) => setValue(event.target.value)} /></label>
        <button className="cw-btn-primary wide" onClick={() => onSubmit(value)}>{action}</button>
      </section>
    </div>
  );
}
