import type { NextAuthOptions, Session } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getServerSession as getNextAuthServerSession } from 'next-auth';
import { headers } from 'next/headers';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sessionFromAccessToken } from '@/lib/mobile-auth';
import { AppError } from '@/lib/errors';

/**
 * Compute the primary role from a roles array based on priority.
 * Primary role is used for routing and navigation.
 */
export function computePrimaryRole(roles: string[]): string {
  const rolePriority: Record<string, number> = {
    SUPER_ADMIN: 0,
    BRANCH_ADMIN: 1,
    TRAINER: 2,
    KICKBOXING_TRAINER: 3,
    CROSSFIT_TRAINER: 4,
    CLIENT: 5,
  };

  const sortedRoles = [...roles].sort((a, b) => {
    const priorityA = rolePriority[a] ?? 999;
    const priorityB = rolePriority[b] ?? 999;
    return priorityA - priorityB;
  });

  return sortedRoles[0] || 'CLIENT';
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.roles = (token.roles as string[]) || [];
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
 *
 * Accepts EITHER a NextAuth cookie (web) OR a mobile `Authorization: Bearer`
 * access token (Flutter app). When a Bearer header is present we use only the
 * JWT path — an invalid/expired token returns null (there is no cookie to fall
 * back to). The returned shape is identical for both paths, so RBAC, branch
 * scoping, and audit logging in the 150+ route handlers work unchanged.
 *
 * See src/lib/mobile-auth.ts and docs/flutter-migration-plan.md §3.
 */
export async function getServerSession(): Promise<Session | null> {
  const authz = (await headers()).get('authorization');
  if (authz?.startsWith('Bearer ')) {
    const token = authz.slice(7).trim();
    return token ? sessionFromAccessToken(token) : null;
  }
  return getNextAuthServerSession(authOptions);
}

/**
 * Auth guard for route handlers. Returns the session, or throws an `AppError`
 * the route's `catch → toErrorResponse` turns into the right HTTP status:
 *
 *   - **401 UNAUTHORIZED** when there is no session — no, expired, or invalid
 *     token/cookie. Distinct from 403 so the mobile client can tell "token
 *     expired → silently refresh and retry" from "logged in but not allowed".
 *   - **403 FORBIDDEN** when the session holds none of `allowedRoles`.
 *
 * Replaces the old conflated `if (!session || !hasRole(...)) → 403`, which made
 * an expired mobile access token look like a permission error (the app's
 * refresh-on-401 never fired). `matchAllRoles` checks every role the user holds
 * (mirrors `hasRole(session.user.roles ?? [session.user.role], ...)`); the
 * default checks the computed primary role.
 *
 * Branch scoping and audit logging are unchanged — callers use the returned
 * session exactly as before.
 */
export async function requireRole(
  allowedRoles: string[],
  opts: { matchAllRoles?: boolean } = {},
): Promise<Session> {
  return assertSessionRole(await getServerSession(), allowedRoles, opts);
}

/**
 * Pure auth/authz check (no request context) behind {@link requireRole}, split
 * out so the 401-vs-403 decision is unit-testable. Throws 401 when `session` is
 * null, 403 when it lacks an allowed role; otherwise returns the session.
 */
export function assertSessionRole(
  session: Session | null,
  allowedRoles: string[],
  opts: { matchAllRoles?: boolean } = {},
): Session {
  if (!session) {
    throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  }
  const subject = opts.matchAllRoles
    ? (session.user.roles ?? [session.user.role])
    : session.user.role;
  if (!hasRole(subject, allowedRoles)) {
    throw new AppError('FORBIDDEN', 'Forbidden', 403);
  }
  return session;
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
