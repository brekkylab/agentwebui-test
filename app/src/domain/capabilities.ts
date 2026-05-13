import type { SchedulePreview, Session, SessionIntent, SkillPreview } from './types';

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';

export interface ResolvedScheduleTrigger {
  prompt: string;
  title: string;
  intent: SessionIntent;
}

export interface ScheduleRenderText {
  triggerLabel: string;
  triggerBody: string;
  resultLabel: string;
}

export function buildSkillRunReply(skill: Pick<SkillPreview, 'name'>): string {
  return `▶ ${skill.name} skill을 실행했습니다.\n\n입력된 prompt template과 project Files를 기준으로 결과 session을 만들었어요. 실제 backend가 연결되면 이 위치에서 runnable skill executor가 호출됩니다.`;
}

export function buildScheduleRunReply(title: string): string {
  return `${title} schedule 발화를 처리했습니다.\n\nMock에서는 즉시 session/message state를 만들고, backend-v2에서는 cron trigger와 worker result가 같은 contract로 들어오도록 둔 상태입니다.`;
}

export function resolveScheduleTrigger(schedule: SchedulePreview, skills: SkillPreview[]): ResolvedScheduleTrigger | null {
  const trigger = schedule.trigger;
  if (trigger.kind === 'skill') {
    const skill = skills.find((item) => item.id === trigger.skillId);
    if (!skill) return null;
    return { prompt: skill.promptTemplate || skill.description, title: skill.name, intent: skill.defaultIntent || 'recap' };
  }
  return { prompt: trigger.prompt, title: 'Schedule 발화', intent: 'recap' };
}

export function getScheduleText(schedule: SchedulePreview, skills: SkillPreview[], sessions: Session[]): ScheduleRenderText {
  const trigger = schedule.trigger;
  let triggerLabel = 'free prompt';
  let triggerBody = trigger.kind === 'prompt' ? trigger.prompt : '';
  if (trigger.kind === 'skill') {
    const skill = skills.find((item) => item.id === trigger.skillId);
    triggerLabel = skill ? `skill: ${skill.name}` : 'skill: (삭제됨)';
    triggerBody = skill?.promptTemplate || skill?.description || '';
  }

  const resultTarget = schedule.resultTarget;
  let resultLabel = 'Activity feed에만 신호';
  if (resultTarget.kind === 'new_session_each_time') resultLabel = '매번 새 session 자동 생성';
  if (resultTarget.kind === 'append_to_session') {
    const session = sessions.find((item) => item.id === resultTarget.sessionId);
    resultLabel = session ? `⟳ 누적 → ${session.title}` : '⟳ 누적 → (삭제된 session)';
  }
  return { triggerLabel, triggerBody, resultLabel };
}

export function parseCron(cron?: string): { freq: ScheduleFrequency; hour: number; minute: number; weekday: number; monthday: number } {
  if (!cron) return { freq: 'weekly', hour: 9, minute: 0, weekday: 1, monthday: 1 };
  const [minuteRaw, hourRaw, dayRaw, , weekdayRaw] = cron.split(' ');
  const minute = Number(minuteRaw) || 0;
  const hour = Number(hourRaw) || 9;
  if (dayRaw && dayRaw !== '*') return { freq: 'monthly', hour, minute, weekday: 1, monthday: Number(dayRaw) || 1 };
  if (weekdayRaw && weekdayRaw !== '*') return { freq: 'weekly', hour, minute, weekday: Number(weekdayRaw) || 1, monthday: 1 };
  return { freq: 'daily', hour, minute, weekday: 1, monthday: 1 };
}

export function formatFriendlyTime(freq: ScheduleFrequency, hour: number, minute: number, weekday: number, monthday: number): string {
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  if (freq === 'daily') return `매일 ${time}`;
  if (freq === 'weekly') return `매주 ${['일', '월', '화', '수', '목', '금', '토'][weekday]} ${time}`;
  return `매월 ${monthday}일 ${time}`;
}

export function formatCron(freq: ScheduleFrequency, hour: number, minute: number, weekday: number, monthday: number): string {
  if (freq === 'daily') return `${minute} ${hour} * * *`;
  if (freq === 'weekly') return `${minute} ${hour} * * ${weekday}`;
  return `${minute} ${hour} ${monthday} * *`;
}

export function scheduleRunTimestamp(): string {
  return '2026-05-13 18:00';
}
