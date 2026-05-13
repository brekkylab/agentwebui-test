import { useState, type ReactNode } from 'react';
import type { AppState, ScheduleFormInput, SkillFormInput } from '../../domain/appState';
import type { ProjectId, SchedulePreview, ScheduleResultTarget, ScheduleTrigger, SessionIntent, SkillPreview, UserId } from '../../domain/types';
import { formatCron, formatFriendlyTime, getScheduleText, parseCron, type ScheduleFrequency } from '../../domain/capabilities';
import { intentMeta } from '../../domain/metadata';
import { Avatar, byId, compactTime, EmptyState, IconPocket, IntentIcon, SectionLabel } from '../../components/uiPrimitives';
import { Icon } from '../../components/Icon';

export function SkillsPage({ state, openSkillDialog, deleteSkill, runSkill, copySkillMention }: { state: AppState; openSkillDialog: (skillId?: string) => void; deleteSkill: (skillId: string) => void; runSkill: (skillId: string) => void; copySkillMention: (skill: SkillPreview) => void }) {
  const project = byId(state.projects, state.activeProjectId);
  const projectSkills = state.skills.filter((skill) => skill.projectId === project.id);
  const isOwner = project.ownerId === state.currentUserId;
  return (
    <section className="cw-page cw-skills-page cw-page-enter">
      <div className="cw-page-head"><div><h1>Skills</h1><p>이 project의 팀이 정의·소유하는 reusable capability. 📖 reference는 @멘션으로 호출, 📖▶ runnable은 즉시 실행도 가능.</p></div>{isOwner && <button className="cw-btn-primary" onClick={() => openSkillDialog()}><IconPocket tone="add" icon="plus" compact /> 새 Skill</button>}</div>
      <div className="cw-list-meta"><SectionLabel>Skills · {projectSkills.length}개</SectionLabel><span>SKILL.md shape · backend-ready mock</span></div>
      {projectSkills.length ? <div className="cw-skill-list">{projectSkills.map((skill) => <SkillCard key={skill.id} skill={skill} state={state} isOwner={isOwner} onEdit={() => openSkillDialog(skill.id)} onDelete={() => deleteSkill(skill.id)} onRun={() => runSkill(skill.id)} onCopy={() => copySkillMention(skill)} />)}</div> : <EmptyState title="아직 정의된 skill이 없어요" body="session에서 메시지를 lift하거나 새 Skill을 만들어 반복 작업을 팀 capability로 저장하세요." action={isOwner ? '첫 Skill 만들기' : undefined} onAction={isOwner ? () => openSkillDialog() : undefined} />}
    </section>
  );
}

function SkillCard({ skill, state, isOwner, onEdit, onDelete, onRun, onCopy }: { skill: SkillPreview; state: AppState; isOwner: boolean; onEdit: () => void; onDelete: () => void; onRun: () => void; onCopy: () => void }) {
  const author = byId(state.users, skill.createdBy);
  return (
    <article className="cw-skill-card">
      <div className="cw-skill-card-head">
        <span className="cw-skill-glyph">{skill.runnable ? '📖▶' : '📖'}</span>
        <div><h2>{skill.name}</h2><p>{skill.description}</p></div>
        <span className={`cw-skill-mode ${skill.runnable ? 'runnable' : 'reference'}`}>{skill.runnable ? 'RUNNABLE' : 'REFERENCE'}</span>
      </div>
      <div className="cw-skill-when"><span>when:</span>{skill.whenToUse}</div>
      {skill.runnable && <div className="cw-skill-tools">tools: {(skill.toolBindings?.length ? skill.toolBindings.join(', ') : 'none')}{skill.defaultIntent && <span> · intent: {intentMeta[skill.defaultIntent].label}</span>}</div>}
      <div className="cw-skill-footer"><Avatar user={author} small /><span>{author.name.split(' ')[0]} · {compactTime(skill.createdAt)}</span><div className="spacer" />{isOwner && <button className="cw-btn-secondary" onClick={onEdit}>편집</button>}<button className="cw-btn-secondary" onClick={onCopy}>@mention 복사</button>{skill.runnable && <button className="cw-btn-primary" onClick={onRun}>▶ 실행</button>}{isOwner && <button className="cw-btn-ghost" onClick={onDelete}>삭제</button>}</div>
    </article>
  );
}

export function SchedulePage({ state, openScheduleDialog, toggleSchedule, deleteSchedule, runScheduleNow }: { state: AppState; openScheduleDialog: (scheduleId?: string) => void; toggleSchedule: (scheduleId: string) => void; deleteSchedule: (scheduleId: string) => void; runScheduleNow: (scheduleId: string) => void }) {
  const project = byId(state.projects, state.activeProjectId);
  const projectSchedules = state.schedules.filter((schedule) => schedule.projectId === project.id);
  const isOwner = project.ownerId === state.currentUserId;
  return (
    <section className="cw-page cw-schedule-page cw-page-enter">
      <div className="cw-page-head"><div><h1>Schedule</h1><p>정해진 시점에 자동으로 발화하는 trigger. Owner만 등록·편집할 수 있고, 모든 멤버가 ▶ 지금 실행 가능.</p></div>{isOwner && <button className="cw-btn-primary" onClick={() => openScheduleDialog()}><IconPocket tone="add" icon="plus" compact /> 새 Schedule</button>}</div>
      <div className="cw-list-meta"><SectionLabel>Schedules · {projectSchedules.length}개</SectionLabel><span>※ mock cron 아님 · ▶ 지금 실행으로 시연</span></div>
      {projectSchedules.length ? <div className="cw-schedule-list">{projectSchedules.map((schedule) => <ScheduleCard key={schedule.id} schedule={schedule} state={state} isOwner={isOwner} onEdit={() => openScheduleDialog(schedule.id)} onToggle={() => toggleSchedule(schedule.id)} onDelete={() => deleteSchedule(schedule.id)} onRun={() => runScheduleNow(schedule.id)} />)}</div> : <EmptyState title="아직 등록된 schedule이 없어요" body="주간 정리·결정사항 정리처럼 반복하는 일을 자동 발화로 옮겨보세요." action={isOwner ? '새 Schedule' : undefined} onAction={isOwner ? () => openScheduleDialog() : undefined} />}
      <ActivityFeed state={state} projectId={project.id} />
    </section>
  );
}

function ScheduleCard({ schedule, state, isOwner, onEdit, onToggle, onDelete, onRun }: { schedule: SchedulePreview; state: AppState; isOwner: boolean; onEdit: () => void; onToggle: () => void; onDelete: () => void; onRun: () => void }) {
  const resolved = getScheduleText(schedule, state.skills, state.sessions);
  return (
    <article className={`cw-schedule-card ${schedule.active ? '' : 'is-paused'}`}>
      <div className="cw-schedule-time"><IconPocket tone="schedule" icon="calendar" /><b>{schedule.friendlyTime}</b><span>({schedule.timezone})</span><em className={schedule.active ? 'is-on' : 'is-off'}>{schedule.active ? '✅ 활성' : '⏸ 일시정지됨'}</em></div>
      <ScheduleRow label="▶ 발화"><b>{resolved.triggerLabel}</b><span>{resolved.triggerBody}</span></ScheduleRow>
      <ScheduleRow label="결과"><span>{resolved.resultLabel}</span></ScheduleRow>
      <ScheduleRow label="다음"><code>{schedule.nextRunAt || '—'}</code></ScheduleRow>
      <ScheduleRow label="알림"><span className="cw-notify-stack">{schedule.notifyUserIds.map((id) => { const user = byId(state.users, id); return <span key={id}><Avatar user={user} small />{user.name.split(' ')[0]}</span>; })}</span></ScheduleRow>
      <div className="cw-schedule-actions">{isOwner && <button className="cw-btn-secondary" onClick={onEdit}>편집</button>}{isOwner && <button className="cw-btn-secondary" onClick={onToggle}>{schedule.active ? '⏸ 일시정지' : '▶ 재개'}</button>}<button className="cw-btn-primary" onClick={onRun}>▶ 지금 실행</button><div className="spacer" />{isOwner && <button className="cw-btn-ghost" onClick={onDelete}>삭제</button>}</div>
    </article>
  );
}

function ScheduleRow({ label, children }: { label: string; children: ReactNode }) { return <div className="cw-schedule-row"><span className="lbl">{label}</span><div className="val">{children}</div></div>; }

function ActivityFeed({ state, projectId }: { state: AppState; projectId: ProjectId }) {
  const entries = state.activityFeed.filter((entry) => entry.projectId === projectId).slice(0, 5);
  if (!entries.length) return null;
  return <div className="cw-activity-feed-panel"><div className="cw-list-meta"><SectionLabel>Activity</SectionLabel><span>schedule 자동 발화</span></div>{entries.map((entry) => <article key={entry.id} className="cw-activity-entry"><IconPocket tone="content" icon="sparkles" compact /><div><b>{entry.title}</b><p>{entry.body}</p><time>{entry.occurredAt}</time></div></article>)}</div>;
}
export function SkillDialog({ state, skillId, onClose, onCreate, onUpdate }: { state: AppState; skillId?: string; onClose: () => void; onCreate: (input: SkillFormInput) => void; onUpdate: (skillId: string, input: SkillFormInput) => void }) {
  const editing = skillId ? state.skills.find((skill) => skill.id === skillId) : undefined;
  const [name, setName] = useState(editing?.name || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [whenToUse, setWhenToUse] = useState(editing?.whenToUse || '');
  const [body, setBody] = useState(editing?.body || '');
  const [runnable, setRunnable] = useState(editing?.runnable || false);
  const [promptTemplate, setPromptTemplate] = useState(editing?.promptTemplate || '');
  const [tools, setTools] = useState((editing?.toolBindings || []).join(', '));
  const [defaultIntent, setDefaultIntent] = useState<SessionIntent>(editing?.defaultIntent || 'general');
  const save = () => {
    if (!name.trim()) return;
    const input: SkillFormInput = {
      name: name.trim(),
      description: description.trim(),
      whenToUse: whenToUse.trim(),
      body: body.trim(),
      runnable,
      promptTemplate: runnable ? promptTemplate.trim() : undefined,
      toolBindings: runnable ? tools.split(',').map((tool) => tool.trim()).filter(Boolean) : undefined,
      defaultIntent: runnable ? defaultIntent : undefined,
    };
    if (editing) onUpdate(editing.id, input); else onCreate(input);
  };
  return (
    <div className="cw-dialog-backdrop" onClick={onClose}>
      <section className="cw-dialog cw-wide-dialog" onClick={(event) => event.stopPropagation()}>
        <button className="cw-close" onClick={onClose}><Icon name="x" /></button>
        <div className="cw-dialog-head"><h2>{editing ? 'Skill 편집' : '새 Skill 만들기'}</h2><p>SKILL.md 형식 — frontmatter(이름·설명·언제) + 본문. Runnable 토글하면 schedule에서 trigger 가능해요.</p></div>
        <label className="cw-field">이름<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 주간 진행 정리" /></label>
        <label className="cw-field">설명<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="한 줄로 이 skill이 뭐 하는지" /></label>
        <label className="cw-field">언제 쓸까<input value={whenToUse} onChange={(event) => setWhenToUse(event.target.value)} placeholder="예: 월요일 status 공유 전" /></label>
        <label className="cw-field">본문 (markdown)<textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="이 skill의 구체적인 절차·예시·자료..." /></label>
        <label className="cw-check-row"><input type="checkbox" checked={runnable} onChange={(event) => setRunnable(event.target.checked)} /><span>📖▶ <b>Runnable</b> — 실행 가능 (schedule trigger 대상)</span></label>
        {runnable && <div className="cw-runnable-panel">
          <label className="cw-field">발화 prompt template<textarea value={promptTemplate} onChange={(event) => setPromptTemplate(event.target.value)} placeholder="실행 시 첫 메시지로 들어갈 텍스트" /></label>
          <label className="cw-field">사용할 tool (comma 구분)<input value={tools} onChange={(event) => setTools(event.target.value)} placeholder="rag, time" /></label>
          <div className="cw-field"><span>발화 session default intent</span><div className="cw-chip-row">{(Object.keys(intentMeta) as SessionIntent[]).map((intent) => <button type="button" key={intent} className={`cw-choice-chip ${defaultIntent === intent ? 'is-on' : ''}`} onClick={() => setDefaultIntent(intent)}><IntentIcon intent={intent} force />{intentMeta[intent].label}</button>)}</div></div>
        </div>}
        <div className="cw-dialog-foot"><span>{editing ? `${compactTime(editing.updatedAt)} 마지막 수정` : '새 skill'}</span><div><button className="cw-btn-secondary" onClick={onClose}>취소</button><button className="cw-btn-primary" disabled={!name.trim()} onClick={save}>{editing ? '저장' : 'Skill 만들기'}</button></div></div>
      </section>
    </div>
  );
}

export function ScheduleDialog({ state, scheduleId, onClose, onCreate, onUpdate }: { state: AppState; scheduleId?: string; onClose: () => void; onCreate: (input: ScheduleFormInput) => void; onUpdate: (scheduleId: string, input: ScheduleFormInput) => void }) {
  const editing = scheduleId ? state.schedules.find((schedule) => schedule.id === scheduleId) : undefined;
  const parsed = parseCron(editing?.cron);
  const project = byId(state.projects, state.activeProjectId);
  const runnableSkills = state.skills.filter((skill) => skill.projectId === state.activeProjectId && skill.runnable);
  const sessionsHere = state.sessions.filter((session) => session.projectId === state.activeProjectId && (session.shareMode !== 'private' || session.creatorId === state.currentUserId));
  const [freq, setFreq] = useState<ScheduleFrequency>(parsed.freq);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [weekday, setWeekday] = useState(parsed.weekday);
  const [monthday, setMonthday] = useState(parsed.monthday);
  const [triggerKind, setTriggerKind] = useState<ScheduleTrigger['kind']>(editing?.trigger.kind || (runnableSkills[0] ? 'skill' : 'prompt'));
  const [skillId, setSkillId] = useState(editing?.trigger.kind === 'skill' ? editing.trigger.skillId : runnableSkills[0]?.id || '');
  const [promptText, setPromptText] = useState(editing?.trigger.kind === 'prompt' ? editing.trigger.prompt : '');
  const [resultKind, setResultKind] = useState<ScheduleResultTarget['kind']>(editing?.resultTarget.kind || 'new_session_each_time');
  const [resultSessionId, setResultSessionId] = useState(editing?.resultTarget.kind === 'append_to_session' ? editing.resultTarget.sessionId : sessionsHere[0]?.id || '');
  const [notify, setNotify] = useState<UserId[]>(editing?.notifyUserIds || [state.currentUserId]);
  const safeHour = clamp(hour, 0, 23);
  const safeMinute = clamp(minute, 0, 59);
  const friendlyTime = formatFriendlyTime(freq, safeHour, safeMinute, weekday, monthday);
  const cron = formatCron(freq, safeHour, safeMinute, weekday, monthday);
  const save = () => {
    const trigger: ScheduleTrigger = triggerKind === 'skill' && skillId ? { kind: 'skill', skillId } : { kind: 'prompt', prompt: promptText.trim() || '이번 주 진척 1줄 요약.' };
    const resultTarget: ScheduleResultTarget = resultKind === 'append_to_session' && resultSessionId ? { kind: 'append_to_session', sessionId: resultSessionId } : resultKind === 'activity_feed_only' ? { kind: 'activity_feed_only' } : { kind: 'new_session_each_time' };
    const input: ScheduleFormInput = { cron, friendlyTime, timezone: 'Asia/Seoul', trigger, resultTarget, resultSessionShareMode: 'shared_chat', notifyUserIds: notify, nextRunAt: `${friendlyTime} (등록 직후)` };
    if (editing) onUpdate(editing.id, input); else onCreate(input);
  };
  return (
    <div className="cw-dialog-backdrop" onClick={onClose}>
      <section className="cw-dialog cw-wide-dialog" onClick={(event) => event.stopPropagation()}>
        <button className="cw-close" onClick={onClose}><Icon name="x" /></button>
        <div className="cw-dialog-head"><h2>{editing ? 'Schedule 편집' : '새 Schedule'}</h2><p>반복 시점·발화 대상·결과 위치를 정해두면 매번 user가 시키지 않아도 자동으로 작동해요.</p></div>
        <div className="cw-form-section"><SectionLabel>언제 발화할까?</SectionLabel><div className="cw-chip-row">{([['daily', '매일'], ['weekly', '매주'], ['monthly', '매월']] as const).map(([key, label]) => <button type="button" key={key} className={`cw-choice-chip ${freq === key ? 'is-on' : ''}`} onClick={() => setFreq(key)}>{label}</button>)}</div><div className="cw-time-row">{freq === 'weekly' && <select value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>{['일', '월', '화', '수', '목', '금', '토'].map((day, index) => <option key={day} value={index}>{day}요일</option>)}</select>}{freq === 'monthly' && <select value={monthday} onChange={(event) => setMonthday(Number(event.target.value))}>{Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}일</option>)}</select>}<input type="number" min={0} max={23} value={hour} onChange={(event) => setHour(Number(event.target.value))} /><span>:</span><input type="number" min={0} max={59} value={minute} onChange={(event) => setMinute(Number(event.target.value))} /><code>{cron}</code></div><p className="cw-form-hint">→ {friendlyTime} (Asia/Seoul)</p></div>
        <div className="cw-form-section"><SectionLabel>무엇을 발화?</SectionLabel><label className="cw-check-row"><input type="radio" name="trigger" checked={triggerKind === 'skill'} disabled={!runnableSkills.length} onChange={() => setTriggerKind('skill')} /><span>등록된 runnable skill 사용</span></label>{triggerKind === 'skill' && <select className="cw-offset-control" value={skillId} onChange={(event) => setSkillId(event.target.value)}>{runnableSkills.map((skill) => <option key={skill.id} value={skill.id}>▶ {skill.name}</option>)}</select>}<label className="cw-check-row"><input type="radio" name="trigger" checked={triggerKind === 'prompt'} onChange={() => setTriggerKind('prompt')} /><span>Free prompt 입력</span></label>{triggerKind === 'prompt' && <textarea className="cw-offset-control" value={promptText} onChange={(event) => setPromptText(event.target.value)} placeholder="예: 오늘 sessions에서 나온 결정사항을 한 줄로 정리." />}</div>
        <div className="cw-form-section"><SectionLabel>결과 받을 곳</SectionLabel>{([{ value: 'new_session_each_time', title: '매번 새 session 자동 생성', desc: '회의록처럼 각 회 단위로 보관할 때' }, { value: 'append_to_session', title: '지정한 session에 계속 누적', desc: '시계열 thread — 매 발화가 같은 session에 turn으로 추가' }, { value: 'activity_feed_only', title: 'Activity feed에만 신호', desc: '가벼운 한 줄 표시 — session 생성 안 함' }] as const).map((option) => <label key={option.value} className="cw-radio-card"><input type="radio" name="result" checked={resultKind === option.value} onChange={() => setResultKind(option.value)} /><span><b>{option.title}</b><small>{option.desc}</small></span></label>)}{resultKind === 'append_to_session' && <select className="cw-offset-control" value={resultSessionId} onChange={(event) => setResultSessionId(event.target.value)}>{sessionsHere.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}</select>}</div>
        <div className="cw-form-section"><SectionLabel>알림 대상</SectionLabel><div className="cw-chip-row">{project.memberIds.map((id) => { const user = byId(state.users, id); const on = notify.includes(id); return <button type="button" key={id} className={`cw-choice-chip ${on ? 'is-on' : ''}`} onClick={() => setNotify(on ? notify.filter((value) => value !== id) : [...notify, id])}><Avatar user={user} small />{user.name.split(' ')[0]}</button>; })}</div></div>
        <div className="cw-dialog-foot"><span /> <div><button className="cw-btn-secondary" onClick={onClose}>취소</button><button className="cw-btn-primary" onClick={save}>{editing ? '저장' : '등록'}</button></div></div>
      </section>
    </div>
  );
}


function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}
