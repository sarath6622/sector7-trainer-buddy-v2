import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';

const ROLE_REDIRECT: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  BRANCH_ADMIN: '/admin',
  TRAINER: '/trainer',
  KICKBOXING_TRAINER: '/trainer',
  CLIENT: '/client',
};

export default async function RootPage() {
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  const destination = ROLE_REDIRECT[session.user.role] ?? '/login';
  redirect(destination);
}
