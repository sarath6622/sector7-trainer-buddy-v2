import { ProgramEditorView } from '@/components/routines/ProgramEditorView';

export default async function AdminEditRoutineProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProgramEditorView key={id} programId={id} basePath="/admin/routines" />;
}
