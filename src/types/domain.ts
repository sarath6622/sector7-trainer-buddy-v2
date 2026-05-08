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
  RescheduleRequest,
  PtPackagePlan,
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

/** RescheduleRequest with all relations needed for list/detail views */
export interface RescheduleRequestWithRelations {
  id: string;
  branchId: string;
  sessionInstanceId: string;
  clientProfileId: string;
  requestedDate: Date;
  requestedTime: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  client: {
    id: string;
    user: { firstName: string; lastName: string; email: string; phone: string | null };
  };
  sessionInstance: {
    id: string;
    scheduledDate: Date;
    scheduledTime: string;
    durationMin: number;
    status: string;
    trainer: {
      id: string;
      user: { firstName: string; lastName: string };
    };
  };
}

/** PT package plan with active assignment count (used in admin catalog list view) */
export interface PtPackagePlanWithCount {
  id: string;
  branchId: string;
  name: string;
  sessionsPerMonth: number;
  pricePerCycle: number;
  sessionChargeAmount: number | null;
  durationDays: number;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { packages: number };
}
