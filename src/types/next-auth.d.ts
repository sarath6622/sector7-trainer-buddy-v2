import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    id: string;
    role: string;
    roles: string[];
    branchId: string;
    firstName: string;
    lastName: string;
    trainerProfileId: string | null;
    clientProfileId: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      roles: string[];
      branchId: string;
      firstName: string;
      lastName: string;
      trainerProfileId: string | null;
      clientProfileId: string | null;
      /** ADR-055: why a signed-in user was cut off (deactivated / left the gym). */
      accessBlocked: import('@/lib/access-blocked').AccessBlockedReason | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
    roles: string[];
    branchId: string;
    firstName: string;
    lastName: string;
    trainerProfileId: string | null;
    clientProfileId: string | null;
    accessBlocked?: import('@/lib/access-blocked').AccessBlockedReason | null;
  }
}
