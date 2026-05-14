import { createFileRoute } from '@tanstack/react-router';
import { EmptyState, SectionLabel } from '@/components/uiPrimitives';
import { Icon } from '@/components/Icon';

export const Route = createFileRoute('/_app/projects/$projectId/schedule')({
  component: SchedulePage,
});

function SchedulePage() {
  return (
    <section className="cw-page cw-simple-page cw-page-enter">
      <SectionLabel>Recurring runs</SectionLabel>
      <h1>Schedule</h1>
      <p>cron + run-now + worker delivery. backend-v2에 worker/notification 인프라가 없어 비활성화 상태입니다.</p>
      <EmptyState
        title="Schedule API 준비 중"
        body="backend-v2에 cron/run-now 엔드포인트와 worker queue가 추가되면 이 화면을 활성화합니다."
        chip={<Icon name="calendar" size={16} />}
      />
    </section>
  );
}
