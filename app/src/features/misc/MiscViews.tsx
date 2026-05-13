import type { ReactNode } from 'react';
import { Avatar, SectionLabel } from '../../components/uiPrimitives';
import type { AppState } from '../../domain/appState';
import type { RouteKey } from '../../domain/types';

export function MembersPage({ state }: { state: AppState }) {
  return (
    <SimplePage title="Members" eyebrow="Team access" body="Project 멤버와 역할을 확인합니다.">
      {state.users.filter((user) => user.id !== 'ai').map((user) => (
        <div className="cw-member-line" key={user.id}>
          <Avatar user={user} />
          <b>{user.name}</b>
          <span>{user.email}</span>
          <em>{user.roleLabel}</em>
        </div>
      ))}
    </SimplePage>
  );
}

export function SettingsPage({ state }: { state: AppState }) {
  return (
    <SimplePage title="Settings" eyebrow="API boundary" body="기본 런타임은 mock adapter지만, backend-v2 endpoint가 맞으면 service adapter만 교체하는 구조를 유지합니다.">
      <code>adapter: {state.apiMode}</code>
      <code>real API calls: disabled</code>
    </SimplePage>
  );
}

export function AuthMock({ patch }: { state: AppState; patch: (fn: (prev: AppState) => AppState) => void }) {
  return (
    <SimplePage title="Auth mock" eyebrow="Separate demo surface" body="Onboarding/Auth는 기본 앱 흐름 밖에 따로 둡니다.">
      <button className="cw-btn-primary" onClick={() => patch((prev) => ({ ...prev, route: 'projects', currentUserId: 'olive' }))}>Enter as Olive</button>
      <button className="cw-btn-secondary" onClick={() => patch((prev) => ({ ...prev, route: 'projects', currentUserId: 'milo' }))}>Enter as Milo</button>
    </SimplePage>
  );
}

export function DemoGuide({ navigate }: { navigate: (route: RouteKey) => void }) {
  return (
    <SimplePage title="60초 demo guide" eyebrow="Presenter" body="Project Home → Files → Session → Artifact 순서로 보여주면 됩니다.">
      <ol>
        <li>KlientCo Project Home에서 session density 확인</li>
        <li>Files에서 ground truth 선택</li>
        <li>Session에서 AI가 파일을 citation으로 사용하는 흐름 확인</li>
      </ol>
      <button className="cw-btn-primary" onClick={() => navigate('project')}>Project Home으로 이동</button>
    </SimplePage>
  );
}

function SimplePage({ title, eyebrow, body, children }: { title: string; eyebrow: string; body: string; children: ReactNode }) {
  return (
    <section className="cw-page cw-simple-page cw-page-enter">
      <SectionLabel>{eyebrow}</SectionLabel>
      <h1>{title}</h1>
      <p>{body}</p>
      <div className="cw-simple-stack">{children}</div>
    </section>
  );
}
