import { ProgramEditorView } from '@/components/routines/ProgramEditorView';

export default async function TrainerEditRoutineProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProgramEditorView key={id} programId={id} basePath="/trainer/routines" />;
}
