import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getProject } from '@/api/projects';
import { SectionLabel } from '@/components/uiPrimitives';

export const Route = createFileRoute('/_app/projects/$projectId/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const { projectId } = Route.useParams();
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => getProject(projectId) });

  return (
    <section className="cw-page cw-simple-page cw-page-enter">
      <SectionLabel>API boundary</SectionLabel>
      <h1>Settings</h1>
      <p>현재 런타임은 backend-v2 live adapter입니다. backend가 제공하는 metadata만 표시합니다.</p>
      <div className="cw-simple-stack">
        <code>name: {project.data?.name ?? '—'}</code>
        <code>description: {project.data?.description || '—'}</code>
        <code>id: {projectId}</code>
        <code>owner_id: {project.data?.ownerId ?? '—'}</code>
      </div>
    </section>
  );
}
