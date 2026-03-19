export type {
  Branch,
  BranchSettings,
  User,
  TrainerProfile,
  ClientProfile,
  PtPackage,
  SessionSchedule,
  SessionInstance,
  WorkoutLog,
  WorkoutSet,
  Exercise,
  ProgressEntry,
  LeaveRequest,
  ClientUnavailability,
  TrainerReassignment,
  KickboxingClass,
  KickboxingEnrollment,
  PaymentRecord,
  NotificationLog,
  AuditLog,
} from '@prisma/client';

import type { User, TrainerProfile, ClientProfile } from '@prisma/client';

/** User with their role-specific profile loaded */
export interface UserWithProfile extends User {
  trainerProfile: TrainerProfile | null;
  clientProfile: ClientProfile | null;
}

/** Session instance with related trainer and client info */
export interface SessionInstanceWithRelations {
  id: string;
  branchId: string;
  scheduledDate: Date;
  scheduledTime: string;
  durationMin: number;
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
  actualDurationMin: number | null;
  isCarryForward: boolean;
  notes: string | null;
  client: {
    id: string;
    user: { firstName: string; lastName: string; email: string };
  };
  trainer: {
    id: string;
    user: { firstName: string; lastName: string };
  };
}

/** Timer state for active sessions */
export interface SessionTimer {
  sessionId: string;
  startedAt: string;
  expectedDurationMin: number;
  elapsedMin?: number;
}
