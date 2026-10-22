import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';
import { SURFACE_COOKIE, defaultPathFor } from '@/lib/roles';

export default async function RootPage() {
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  const preferred = (await cookies()).get(SURFACE_COOKIE)?.value;
  redirect(defaultPathFor(session.user.roles, preferred) ?? '/login');
}
