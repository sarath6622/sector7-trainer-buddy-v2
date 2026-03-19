import type {
  Branch,
  User,
  TrainerProfile,
  ClientProfile,
  PtPackage,
  SessionInstance,
  Exercise,
  BranchSettings,
  SessionSchedule,
} from '@prisma/client';

let counter = 0;
function nextId(): string {
  counter++;
  return `test-${counter}-${Date.now()}`;
}

// ─── BRANCH ──────────────────────────────────────────

export function createTestBranch(overrides: Partial<Branch> = {}): Branch {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: 'Test Branch',
    address: '123 Gym Street',
    phone: '+91-9876543210',
    email: 'branch@sector7.com',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── BRANCH SETTINGS ─────────────────────────────────

export function createTestBranchSettings(overrides: Partial<BranchSettings> = {}): BranchSettings {
  const id = overrides.id ?? nextId();
  return {
    id,
    branchId: overrides.branchId ?? nextId(),
    defaultSessionDurationMin: 60,
    carryForwardLimit: 3,
    cancellationPolicyEnabled: false,
    cancellationWindowMin: 120,
    reminderTimingMin: 60,
    noShowThresholdMin: 15,
    kickboxingClassSizeLimit: 20,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── USER ────────────────────────────────────────────

export function createTestUser(overrides: Partial<User> = {}): User {
  const id = overrides.id ?? nextId();
  return {
    id,
    branchId: overrides.branchId ?? nextId(),
    email: overrides.email ?? `user-${id}@sector7.com`,
    phone: '+91-9876543210',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Test',
    lastName: 'User',
    role: 'CLIENT',
    profileImageUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTestAdmin(overrides: Partial<User> = {}): User {
  return createTestUser({
    firstName: 'Admin',
    lastName: 'User',
    role: 'BRANCH_ADMIN',
    ...overrides,
  });
}

// ─── TRAINER PROFILE ─────────────────────────────────

export function createTestTrainerProfile(overrides: Partial<TrainerProfile> = {}): TrainerProfile {
  const id = overrides.id ?? nextId();
  return {
    id,
    userId: overrides.userId ?? nextId(),
    branchId: overrides.branchId ?? nextId(),
    specialties: ['strength', 'cardio'],
    certifications: ['ACE-CPT'],
    bio: 'Experienced personal trainer',
    workingHoursStart: '06:00',
    workingHoursEnd: '20:00',
    workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTestTrainer(branchId?: string): { user: User; profile: TrainerProfile } {
  const bId = branchId ?? nextId();
  const user = createTestUser({
    branchId: bId,
    firstName: 'Trainer',
    lastName: 'One',
    role: 'TRAINER',
  });
  const profile = createTestTrainerProfile({
    userId: user.id,
    branchId: bId,
  });
  return { user, profile };
}

// ─── CLIENT PROFILE ──────────────────────────────────

export function createTestClientProfile(overrides: Partial<ClientProfile> = {}): ClientProfile {
  const id = overrides.id ?? nextId();
  return {
    id,
    userId: overrides.userId ?? nextId(),
    branchId: overrides.branchId ?? nextId(),
    dateOfBirth: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    height: 175,
    currentWeight: 80,
    bodyFatPercentage: 20,
    medicalConditions: null,
    fitnessGoals: 'Build muscle',
    sessionDurationOverrideMin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTestClient(branchId?: string): { user: User; profile: ClientProfile } {
  const bId = branchId ?? nextId();
  const user = createTestUser({
    branchId: bId,
    firstName: 'Client',
    lastName: 'One',
    role: 'CLIENT',
  });
  const profile = createTestClientProfile({
    userId: user.id,
    branchId: bId,
  });
  return { user, profile };
}

// ─── PT PACKAGE ──────────────────────────────────────

export function createTestPtPackage(overrides: Partial<PtPackage> = {}): PtPackage {
  const id = overrides.id ?? nextId();
  return {
    id,
    branchId: overrides.branchId ?? nextId(),
    clientProfileId: overrides.clientProfileId ?? nextId(),
    trainerProfileId: overrides.trainerProfileId ?? nextId(),
    sessionsPerMonth: 12,
    sessionChargeAmount: 500,
    isActive: true,
    startDate: new Date(),
    endDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── SESSION SCHEDULE ────────────────────────────────

export function createTestSessionSchedule(
  overrides: Partial<SessionSchedule> = {},
): SessionSchedule {
  const id = overrides.id ?? nextId();
  return {
    id,
    branchId: overrides.branchId ?? nextId(),
    clientProfileId: overrides.clientProfileId ?? nextId(),
    trainerProfileId: overrides.trainerProfileId ?? nextId(),
    dayOfWeek: 'MONDAY',
    startTime: '07:00',
    durationMin: 60,
    isActive: true,
    validFrom: new Date(),
    validUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── SESSION INSTANCE ────────────────────────────────

export function createTestSessionInstance(
  overrides: Partial<SessionInstance> = {},
): SessionInstance {
  const id = overrides.id ?? nextId();
  return {
    id,
    branchId: overrides.branchId ?? nextId(),
    scheduleId: null,
    clientProfileId: overrides.clientProfileId ?? nextId(),
    trainerProfileId: overrides.trainerProfileId ?? nextId(),
    scheduledDate: new Date(),
    scheduledTime: '07:00',
    durationMin: 60,
    status: 'SCHEDULED',
    startedAt: null,
    endedAt: null,
    actualDurationMin: null,
    startedByUserId: null,
    endedByUserId: null,
    noShowMarkedAt: null,
    noShowMarkedByUserId: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationWithinWindow: null,
    isCarryForward: false,
    carryForwardFromMonth: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── EXERCISE ────────────────────────────────────────

export function createTestExercise(overrides: Partial<Exercise> = {}): Exercise {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: 'Bench Press',
    targetMuscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipmentRequired: 'Barbell, Bench',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    instructions: 'Lie on bench, grip barbell, lower to chest, press up.',
    demoVideoUrl: null,
    demoGifUrl: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
