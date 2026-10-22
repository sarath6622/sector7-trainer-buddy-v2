import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getServerSession as getNextAuthServerSession } from 'next-auth';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { computePrimaryRole } from '@/lib/roles';

/** How long a server instance trusts a token's roles before re-reading them. */
const ROLES_REVALIDATE_MS = 60_000;

interface FreshAccess {
  roles: string[];
  trainerProfileId: string | null;
  clientProfileId: string | null;
  checkedAt: number;
}

/**
 * Per-instance cache of each user's current roles (ADR-054). The JWT lives for
 * 7 days and rolls on activity, so without this a removed admin, or the old
 * shared admin login once deactivated, would keep working indefinitely.
 * App Router `getServerSession` cannot write the refreshed cookie back, so the
 * cache is what keeps this to one indexed lookup per user per minute.
 */
const accessCache = new Map<string, FreshAccess>();

async function loadFreshAccess(userId: string): Promise<FreshAccess | null> {
  const cached = accessCache.get(userId);
  if (cached && Date.now() - cached.checkedAt < ROLES_REVALIDATE_MS) return cached;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        roles: true,
        isActive: true,
        deletedAt: true,
        trainerProfile: { select: { id: true } },
        clientProfile: { select: { id: true } },
      },
    });
    const fresh: FreshAccess = {
      // A deactivated or deleted user keeps a session object but holds no roles,
      // so every role-gated route and page rejects them.
      roles: user && user.isActive && !user.deletedAt ? user.roles : [],
      trainerProfileId: user?.trainerProfile?.id ?? null,
      clientProfileId: user?.clientProfile?.id ?? null,
      checkedAt: Date.now(),
    };
    accessCache.set(userId, fresh);
    return fresh;
  } catch (error) {
    // A DB blip (e.g. mid-deploy) must not log everyone out: keep the token as is.
    console.error('[auth] role revalidation failed:', error);
    return null;
  }
}

/** Test hook: forget cached roles. */
export function clearAccessCache() {
  accessCache.clear();
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days — sessions roll on activity, so regulars stay signed in
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Email is matched case-insensitively (and whitespace-trimmed) so
        // "Admin@Sector7.com" logs in the same as "admin@sector7.com".
        const user = await prisma.user.findFirst({
          where: { email: { equals: credentials.email.trim(), mode: 'insensitive' } },
          include: {
            trainerProfile: { select: { id: true } },
            clientProfile: { select: { id: true } },
          },
        });

        if (!user || !user.isActive || user.deletedAt) {
          return null;
        }

        const isPasswordValid = await compare(credentials.password, user.passwordHash);
        if (!isPasswordValid) {
          return null;
        }

        // Update last login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        const primaryRole = computePrimaryRole(user.roles);

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: primaryRole,
          roles: user.roles,
          branchId: user.branchId,
          firstName: user.firstName,
          lastName: user.lastName,
          trainerProfileId: user.trainerProfile?.id ?? null,
          clientProfileId: user.clientProfile?.id ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.roles = user.roles;
        token.branchId = user.branchId;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.trainerProfileId = user.trainerProfileId;
        token.clientProfileId = user.clientProfileId;
        return token;
      }

      if (token.id) {
        const fresh = await loadFreshAccess(token.id);
        if (fresh) {
          token.roles = fresh.roles;
          token.role = fresh.roles.length > 0 ? computePrimaryRole(fresh.roles) : '';
          token.trainerProfileId = fresh.trainerProfileId;
          token.clientProfileId = fresh.clientProfileId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        // Tokens always carry `roles`; the fallback covers any minted before it existed.
        session.user.roles =
          (token.roles as string[] | undefined) ?? (token.role ? [token.role as string] : []);
        session.user.branchId = token.branchId as string;
        session.user.firstName = token.firstName as string;
        session.user.lastName = token.lastName as string;
        session.user.trainerProfileId = (token.trainerProfileId as string) ?? null;
        session.user.clientProfileId = (token.clientProfileId as string) ?? null;
      }
      return session;
    },
  },
};

/**
 * Server-side session getter. Use in API routes and server components.
 */
export function getServerSession() {
  return getNextAuthServerSession(authOptions);
}

/**
 * Check if a user has one of the required roles.
 * Accepts either a single role (primary) or an array of roles (all roles).
 */
export function hasRole(userRole: string | string[], allowedRoles: string[]): boolean {
  if (Array.isArray(userRole)) {
    // Check if any of the user's roles is in the allowed roles
    return userRole.some((role) => allowedRoles.includes(role));
  }
  // Single role check (backward compatible)
  return allowedRoles.includes(userRole);
}

/**
 * Authorize read access to a specific client's training data
 * (`/api/trainer/clients/[id]/*` endpoints). Returns true if the caller is:
 *   - a trainer / admin in the same branch (the existing trainer-only check), OR
 *   - the client themselves (clientProfileId matches their own profile).
 *
 * Added 2026-05-16 so the WorkoutLogger — now usable by clients on their own
 * PT sessions (ADR-036) — can hit the same in-session helper endpoints
 * (last-sets, workout-history, exercise-progress, etc.) without forcing us
 * to mirror every route under `/api/client/*`.
 */
export function canReadClientTrainingData(
  user: { role?: string; roles?: string[]; clientProfileId?: string | null },
  clientProfileId: string,
): boolean {
  const roles = user.roles ?? (user.role ? [user.role] : []);
  if (hasRole(roles, ['TRAINER', 'KICKBOXING_TRAINER', 'SUPER_ADMIN', 'BRANCH_ADMIN'])) {
    return true;
  }
  if (hasRole(roles, ['CLIENT']) && user.clientProfileId === clientProfileId) {
    return true;
  }
  return false;
}

/**
 * May this user see trainer-private annotations on a client's training data?
 *
 * ADR-052: `WorkoutLog.notes` is the trainer's working memo about an exercise
 * ("went light, shoulder niggle"), not client-facing feedback. Staff only.
 *
 * Deliberately separate from `canReadClientTrainingData`, which also admits the
 * client themselves — they may read their own sets and history, but not the
 * notes written about them. Any endpoint that both roles can call must gate the
 * notes on THIS check, not on access to the route.
 */
export function canReadTrainerPrivateNotes(user: { role?: string; roles?: string[] }): boolean {
  const roles = user.roles ?? (user.role ? [user.role] : []);
  return hasRole(roles, ['TRAINER', 'KICKBOXING_TRAINER', 'SUPER_ADMIN', 'BRANCH_ADMIN']);
}
