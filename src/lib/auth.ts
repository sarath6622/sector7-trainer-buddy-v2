import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getServerSession as getNextAuthServerSession } from 'next-auth';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';

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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
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

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
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
 */
export function hasRole(userRole: string, allowedRoles: string[]): boolean {
  return allowedRoles.includes(userRole);
}
