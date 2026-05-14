import { createFileRoute } from '@tanstack/react-router';
import { EmptyState, SectionLabel } from '@/components/uiPrimitives';
import { Icon } from '@/components/Icon';

export const Route = createFileRoute('/_app/projects/$projectId/skills')({
  component: SkillsPage,
});

function SkillsPage() {
  return (
    <section className="cw-page cw-simple-page cw-page-enter">
      <SectionLabel>Reusable prompts & tools</SectionLabel>
      <h1>Skills</h1>
      <p>재사용 가능한 prompt template + tool binding. backend-v2에 아직 skills CRUD/run 엔드포인트가 없어 비활성화 상태입니다.</p>
      <EmptyState
        title="Skills API 준비 중"
        body="backend-v2에 skills CRUD/run 엔드포인트가 추가되면 이 화면이 활성화됩니다."
        chip={<Icon name="zap" size={16} />}
      />
    </section>
  );
}
