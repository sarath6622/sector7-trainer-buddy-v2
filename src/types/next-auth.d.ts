import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    id: string;
    role: string;
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
      branchId: string;
      firstName: string;
      lastName: string;
      trainerProfileId: string | null;
      clientProfileId: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
    branchId: string;
    firstName: string;
    lastName: string;
    trainerProfileId: string | null;
    clientProfileId: string | null;
  }
}
