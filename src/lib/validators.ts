import { z } from 'zod';

// ─── SHARED PRIMITIVES ──────────────────────────────

const cuidSchema = z.string().min(1, 'ID is required');
const emailSchema = z.string().email();
const phoneSchema = z.string().min(7).max(20).optional();
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM format');
const dateSchema = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: 'Must be a valid date string (YYYY-MM-DD or ISO 8601)',
});
const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(500).default(20);

// ─── ENUMS ───────────────────────────────────────────

export const userRoleSchema = z.enum([
  'SUPER_ADMIN',
  'BRANCH_ADMIN',
  'TRAINER',
  'KICKBOXING_TRAINER',
  'CROSSFIT_TRAINER',
  'CLIENT',
  'TV_DISPLAY',
]);

export const sessionStatusSchema = z.enum([
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED',
]);

export const leaveStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export const paymentStatusSchema = z.enum(['PAID', 'PENDING', 'OVERDUE']);

export const paymentMethodSchema = z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER']);

export const dayOfWeekSchema = z.enum([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);

export const trainerShiftSchema = z.object({
  label: z.string().min(1).max(100),
  startTime: timeSchema,
  endTime: timeSchema,
  days: z.array(dayOfWeekSchema).min(1, 'At least one day is required'),
});

export const kickboxingClientTypeSchema = z.enum(['GYM_MEMBER', 'GYM_ONLY', 'EXTERNAL_ONLY']);

export const difficultyLevelSchema = z.enum(['EASY', 'MEDIUM', 'HARD']);

export const exerciseTypeSchema = z.enum(['WEIGHTED', 'BODYWEIGHT', 'DURATION', 'CARDIO']);

export const secondaryMetricSchema = z.enum(['KM', 'STEPS', 'METERS', 'NONE']);

export const exerciseCategorySchema = z.enum([
  'HYPERTROPHY',
  'CARDIO',
  'FLEXIBILITY',
  'STRENGTH',
  'FUNCTIONAL',
]);

export const badgeTypeSchema = z.enum([
  'STREAK',
  'PERSONAL_RECORD',
  'BODY_COMPOSITION',
  'SESSION_MILESTONE',
  'WEIGHT_LIFTED',
  'EXERCISE_MILESTONE',
]);

export const thresholdUnitSchema = z.enum(['KG', 'REPS', 'SECONDS', 'STEPS']);

export const durationConditionSchema = z.enum(['LONGER_IS_BETTER', 'SHORTER_IS_BETTER']);

export const genderSchema = z.enum(['MALE', 'FEMALE']);

export const genderFilterSchema = z.enum(['MALE', 'FEMALE', 'ALL']);

export const rescheduleStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

// ─── PAGINATION ──────────────────────────────────────

export const paginationSchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
});

// ─── AUTH ─────────────────────────────────────────────

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(6),
});

// ─── ADMIN: USERS ────────────────────────────────────

export const createUserSchema = z.object({
  email: emailSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: phoneSchema,
  roles: z.array(userRoleSchema).min(1, 'At least one role must be selected'),
  password: z.string().min(6),
  // Trainer-specific optional fields
  specialties: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  bio: z.string().optional(),
  shifts: z.array(trainerShiftSchema).optional(),
  // Client-specific optional fields
  gender: genderSchema.optional(),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  height: z.number().positive().optional(),
  currentWeight: z.number().positive().optional(),
  bodyFatPercentage: z.number().min(0).max(100).optional(),
  medicalConditions: z.string().optional(),
  fitnessGoals: z.string().optional(),
  sessionDurationOverrideMin: z.number().int().positive().optional(),
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true, email: true });

export const listUsersSchema = paginationSchema.extend({
  role: userRoleSchema.optional(),
});

// ─── ADMIN: TRAINER-CLIENT MAPPINGS ──────────────────

export const createMappingSchema = z.object({
  clientProfileId: cuidSchema,
  trainerProfileId: cuidSchema,
  planId: cuidSchema.optional(),
  sessionsPerMonth: z.number().int().positive(),
  totalSessions: z.number().int().positive().optional(),
  onboardingUsedSessions: z.number().int().min(0).optional(),
  onboardingNotes: z.string().max(500).optional(),
  carryForwardLimit: z.number().int().min(0).max(50).nullable().optional(),
  sessionCharge: z.number().min(0).optional(),
  startDate: dateSchema,
  endDate: dateSchema.optional(),
});

export const updateMappingSchema = z.object({
  planId: cuidSchema.nullable().optional(),
  sessionsPerMonth: z.number().int().positive().optional(),
  totalSessions: z.number().int().positive().optional(),
  onboardingUsedSessions: z.number().int().min(0).optional(),
  onboardingNotes: z.string().max(500).nullable().optional(),
  carryForwardLimit: z.number().int().min(0).max(50).nullable().optional(),
  sessionCharge: z.number().min(0).optional(),
  endDate: dateSchema.optional().nullable(),
  isActive: z.boolean().optional(),
});

// ─── ADMIN: PT PACKAGE PLANS (CATALOG) ───────────────

export const createPackagePlanSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  sessionsPerMonth: z.number().int().positive(),
  pricePerCycle: z.number().min(0),
  sessionChargeAmount: z.number().min(0).optional(),
  durationDays: z.number().int().min(1).max(365),
  description: z.string().max(500).optional(),
});

export const updatePackagePlanSchema = createPackagePlanSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const listPackagePlansSchema = paginationSchema.extend({
  activeOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
});

// ─── ADMIN: SCHEDULING ──────────────────────────────

export const createScheduleSchema = z.object({
  clientProfileId: cuidSchema,
  trainerProfileId: cuidSchema,
  dayOfWeek: dayOfWeekSchema,
  startTime: timeSchema,
  durationMin: z.number().int().positive(),
  validFrom: dateSchema,
  validUntil: dateSchema.optional(),
});

export const updateScheduleSchema = createScheduleSchema.partial();

export const generateSessionsSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
  scheduleIds: z.array(cuidSchema).optional(),
  dryRun: z.boolean().optional(),
});

// ─── ADMIN: SESSION INSTANCES ────────────────────────

export const bulkCreateSessionsSchema = z.object({
  clientProfileId: cuidSchema,
  trainerProfileId: cuidSchema,
  dates: z.array(dateSchema).min(1).max(31),
  startTime: timeSchema,
  durationMin: z.number().int().positive(),
});

export const listSessionsSchema = paginationSchema.extend({
  date: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  trainerId: cuidSchema.optional(),
  clientId: cuidSchema.optional(),
  status: sessionStatusSchema.optional(),
});

export const updateSessionSchema = z.object({
  scheduledDate: dateSchema.optional(),
  scheduledTime: timeSchema.optional(),
  trainerProfileId: cuidSchema.optional(),
});

// ─── ADMIN: CONFLICTS ────────────────────────────────

export const listConflictsSchema = z.object({
  date: z.string(),
  trainerId: cuidSchema.optional(),
});

// ─── ADMIN: VACANT TRAINERS ──────────────────────────

export const vacantTrainersSchema = z.object({
  date: z.string(),
  startTime: timeSchema,
  endTime: timeSchema,
});

// ─── ADMIN: TRAINER AVAILABILITY OVERRIDES ──────────

export const createAvailabilityOverrideSchema = z.object({
  trainerProfileId: cuidSchema,
  date: dateSchema,
  isAvailable: z.boolean(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  reason: z.string().optional(),
});

export const bulkCreateAvailabilityOverrideSchema = z.object({
  trainerProfileId: cuidSchema,
  overrides: z
    .array(
      z.object({
        date: dateSchema,
        isAvailable: z.boolean(),
        startTime: timeSchema.optional(),
        endTime: timeSchema.optional(),
        reason: z.string().optional(),
      }),
    )
    .min(1),
});

export const listAvailabilityOverridesSchema = z.object({
  trainerProfileId: cuidSchema.optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

// ─── ADMIN: LEAVES ───────────────────────────────────

export const listLeavesSchema = paginationSchema.extend({
  status: leaveStatusSchema.optional(),
  trainerId: cuidSchema.optional(),
  leaveCategory: z.enum(['REGULAR', 'EMERGENCY']).optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(), // YYYY-MM
});

export const reviewLeaveSchema = z.object({
  notes: z.string().optional(),
  leaveCategory: z.enum(['REGULAR', 'EMERGENCY']).optional(),
});

// ─── ADMIN: REASSIGNMENT ────────────────────────────

export const createReassignmentSchema = z.object({
  sessionInstanceId: cuidSchema,
  replacementTrainerProfileId: cuidSchema,
  reason: z.string().optional(),
});

export const bulkReassignmentSchema = z.object({
  sessionInstanceIds: z.array(cuidSchema).min(1),
  replacementTrainerProfileId: cuidSchema,
  reason: z.string().optional(),
});

// ─── ADMIN: PAYMENTS ─────────────────────────────────

export const createPaymentSchema = z.object({
  clientProfileId: cuidSchema,
  amount: z.number().positive(),
  method: paymentMethodSchema,
  status: paymentStatusSchema.default('PENDING'),
  paidAt: dateSchema.optional(),
  periodStart: dateSchema.optional(),
  periodEnd: dateSchema.optional(),
  notes: z.string().optional(),
});

export const updatePaymentSchema = z.object({
  status: paymentStatusSchema.optional(),
  amount: z.number().positive().optional(),
  notes: z.string().optional(),
});

export const listPaymentsSchema = paginationSchema.extend({
  clientId: cuidSchema.optional(),
  status: paymentStatusSchema.optional(),
});

// ─── ADMIN: KICKBOXING ──────────────────────────────

export const createKickboxingClassSchema = z.object({
  trainerProfileId: cuidSchema,
  name: z.string().min(1).max(100),
  dayOfWeek: dayOfWeekSchema,
  startTime: timeSchema,
  durationMin: z.number().int().positive().default(60),
  maxCapacity: z.number().int().positive().default(20),
});

export const updateKickboxingClassSchema = createKickboxingClassSchema.partial();

export const createKickboxingEnrollmentSchema = z.object({
  classId: cuidSchema,
  clientProfileId: cuidSchema.optional(),
  clientType: kickboxingClientTypeSchema,
  externalName: z.string().optional(),
  externalPhone: z.string().optional(),
});

export const listKickboxingEnrollmentsSchema = z.object({
  classId: cuidSchema.optional(),
  clientType: kickboxingClientTypeSchema.optional(),
});

// ─── ADMIN: EXERCISE LIBRARY ────────────────────────

export const createExerciseSchema = z.object({
  name: z.string().min(1).max(200),
  targetMuscleGroup: z.string().min(1),
  secondaryMuscles: z.array(z.string()).default([]),
  equipmentRequired: z.string().optional(),
  difficulty: difficultyLevelSchema.optional(),
  category: exerciseCategorySchema,
  exerciseType: exerciseTypeSchema.default('WEIGHTED'),
  // Only meaningful when exerciseType = CARDIO. KM keeps the legacy behavior
  // (distance stored in WorkoutSet.notes); STEPS uses the dedicated
  // stepsCount column; NONE hides the second input.
  secondaryMetric: secondaryMetricSchema.default('KM'),
  isCompound: z.boolean().default(false),
  instructions: z.string().optional(),
  demoVideoUrl: z.string().url().optional(),
  demoGifUrl: z.string().url().optional(),
});

export const updateExerciseSchema = createExerciseSchema.partial();

export const listExercisesSchema = paginationSchema.extend({
  search: z.string().optional(),
  muscleGroup: z.string().optional(),
  muscleGroups: z.string().optional(),
  category: exerciseCategorySchema.optional(),
  exerciseType: exerciseTypeSchema.optional(),
});

export const bulkImportExercisesSchema = z.object({
  exercises: z.array(createExerciseSchema).min(1),
});

// ─── ADMIN: ANALYTICS ────────────────────────────────

export const analyticsQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  trainerId: cuidSchema.optional(),
  clientId: cuidSchema.optional(),
});

export const exportAnalyticsSchema = z.object({
  report: z.string(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  format: z.literal('xlsx').default('xlsx'),
});

// ─── ADMIN: SETTINGS ─────────────────────────────────

export const updateSettingsSchema = z.object({
  defaultSessionDurationMin: z.number().int().positive().optional(),
  carryForwardLimit: z.number().int().min(0).optional(),
  cancellationPolicyEnabled: z.boolean().optional(),
  cancellationWindowMin: z.number().int().positive().optional(),
  reminderTimingMin: z.number().int().positive().optional(),
  noShowThresholdMin: z.number().int().positive().optional(),
  kickboxingClassSizeLimit: z.number().int().positive().optional(),
  monthlyRegularLeaveQuota: z.number().int().min(0).max(31).optional(),
  monthlyEmergencyLeaveQuota: z.number().int().min(0).max(5).optional(),
});

// ─── ADMIN: AUDIT LOGS ──────────────────────────────

export const listAuditLogsSchema = paginationSchema.extend({
  action: z.string().optional(),
  actorId: cuidSchema.optional(),
  subjectType: z.string().optional(),
  subjectId: cuidSchema.optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

// ─── TRAINER: WORKOUTS ───────────────────────────────

export const workoutSetSchema = z.object({
  setNumber: z.number().int().positive(),
  reps: z.number().int().positive().optional(),
  weightKg: z.number().positive().optional(),
  durationSec: z.number().int().positive().optional(),
  rpe: z.number().int().min(1).max(10).optional(),
  // Seconds rested before this set. Auto-filled by the workout logger from
  // the rest timer's total when a set is added right after a rest finishes;
  // can also be entered manually. Capped at 1h to match restTimerStateSchema.
  restSec: z.number().int().min(0).max(3600).optional(),
  // Step count — only used when the parent exercise has secondaryMetric=STEPS
  // (e.g. Stair Climber). Capped generously; treadmill-class machines max out
  // well below 100k per session.
  stepsCount: z.number().int().min(0).max(100000).optional(),
  notes: z.string().optional(),
});

export const workoutEntrySchema = z.object({
  exerciseId: cuidSchema,
  orderIndex: z.number().int().min(0),
  sets: z.array(workoutSetSchema).min(1),
  // ADR-037: mark-complete flag. When omitted, the service leaves the
  // existing completion state untouched (auto-save fires every 800ms; we
  // don't want a keystroke that doesn't touch the toggle to clobber it).
  isCompleted: z.boolean().optional(),
});

export const createWorkoutSchema = z.object({
  sessionInstanceId: cuidSchema,
  exercises: z.array(workoutEntrySchema).min(1),
});

export const updateWorkoutSchema = z.object({
  sets: z.array(workoutSetSchema).optional(),
  reps: z.number().int().positive().optional(),
  weight: z.number().positive().optional(),
  rpe: z.number().int().min(1).max(10).optional(),
  notes: z.string().optional(),
});

export const syncWorkoutsSchema = z.object({
  sessionInstanceId: cuidSchema,
  logs: z.array(
    workoutEntrySchema.extend({
      localId: z.string(),
      createdAt: z.string().datetime(),
    }),
  ),
});

// ─── TRAINER: LEAVES ─────────────────────────────────

const timeHHMM = z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format');

export const leaveCategorySchema = z.enum(['REGULAR', 'EMERGENCY']);

export const applyLeaveSchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    leaveType: z.enum(['FULL_DAY', 'HALF_DAY_AM', 'HALF_DAY_PM', 'CUSTOM']).default('FULL_DAY'),
    leaveCategory: leaveCategorySchema.default('REGULAR'),
    startTime: timeHHMM.optional(), // required when leaveType !== FULL_DAY
    endTime: timeHHMM.optional(),
    reason: z.string().optional(),
  })
  .refine((d) => d.leaveType === 'FULL_DAY' || (!!d.startTime && !!d.endTime), {
    message: 'startTime and endTime are required for partial leaves',
  })
  .refine(
    (d) => {
      if (d.leaveType === 'FULL_DAY' || !d.startTime || !d.endTime) return true;
      return d.startTime < d.endTime;
    },
    { message: 'startTime must be before endTime' },
  );

// ─── TRAINER: PROGRESS ───────────────────────────────

export const createProgressSchema = z.object({
  weightKg: z.number().positive().optional(),
  bodyFatPercent: z.number().min(0).max(100).optional(),
  muscleMass: z.number().positive().optional(),
  chest: z.number().positive().optional(),
  waist: z.number().positive().optional(),
  hips: z.number().positive().optional(),
  bicepLeft: z.number().positive().optional(),
  bicepRight: z.number().positive().optional(),
  thighLeft: z.number().positive().optional(),
  thighRight: z.number().positive().optional(),
  photoUrls: z.array(z.string().url()).optional(),
  notes: z.string().optional(),
});

export const updateProgressSchema = createProgressSchema.partial();

// ─── ADMIN: CROSSFIT ─────────────────────────────────

export const createCrossfitClassSchema = z.object({
  trainerProfileIds: z.array(cuidSchema).min(1, 'At least one trainer is required'),
  name: z.string().min(1).max(100),
  dayOfWeek: dayOfWeekSchema,
  startTime: timeSchema,
  durationMin: z.number().int().positive().default(60),
  maxCapacity: z.number().int().positive().default(20),
});

export const updateCrossfitClassSchema = z.object({
  trainerProfileIds: z.array(cuidSchema).min(1).optional(),
  name: z.string().min(1).max(100).optional(),
  dayOfWeek: dayOfWeekSchema.optional(),
  startTime: timeSchema.optional(),
  durationMin: z.number().int().positive().optional(),
  maxCapacity: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export const createCrossfitEnrollmentSchema = z.object({
  clientProfileId: cuidSchema.optional(),
  clientType: kickboxingClientTypeSchema,
  externalName: z.string().optional(),
  externalPhone: z.string().optional(),
});

export const listCrossfitEnrollmentsSchema = z.object({
  clientType: kickboxingClientTypeSchema.optional(),
});

// ─── CROSSFIT TRAINER ─────────────────────────────────

export const openCrossfitSessionSchema = z.object({
  classId: cuidSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
});

export const markCrossfitAttendanceSchema = z.object({
  clientProfileId: cuidSchema.optional(),
  externalName: z.string().optional(),
});

// ─── KICKBOXING TRAINER ───────────────────────────────

export const openKickboxingSessionSchema = z.object({
  classId: cuidSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
});

export const markKickboxingAttendanceSchema = z.object({
  clientProfileId: cuidSchema.optional(),
  externalName: z.string().optional(),
});

// ─── CLIENT: UNAVAILABILITY ──────────────────────────

export const createUnavailabilitySchema = z.object({
  dates: z.array(z.string()).min(1),
});

// ─── CLIENT: PROGRESS CHARTS ────────────────────────

export const progressChartSchema = z.object({
  metric: z.enum(['weight', 'bodyFat', 'muscleMass', 'exercise']),
  exerciseId: cuidSchema.optional(),
});

// ─── CLIENT: WORKOUTS FILTER ────────────────────────

export const listClientWorkoutsSchema = z.object({
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  exerciseId: cuidSchema.optional(),
  muscleGroup: z.string().optional(),
});

// ─── NOTIFICATIONS ───────────────────────────────────

export const listNotificationsSchema = paginationSchema.extend({
  unreadOnly: z.coerce.boolean().optional(),
});

// ─── BADGE DEFINITIONS ──────────────────────────────

export const createBadgeDefinitionSchema = z
  .object({
    type: badgeTypeSchema,
    name: z.string().min(1).max(100),
    description: z.string().min(1).max(500),
    howToEarn: z.string().max(500).optional(),
    icon: z.string().min(1).max(10).default('🏆'),
    imageUrl: z.string().url().optional().or(z.literal('')),
    thresholdValue: z.number().positive().optional(),
    thresholdUnit: thresholdUnitSchema.optional(),
    durationCondition: durationConditionSchema.optional(),
    exerciseId: cuidSchema.optional(),
    genderFilter: genderFilterSchema.default('ALL'),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.type === 'WEIGHT_LIFTED' || data.type === 'EXERCISE_MILESTONE') {
        return data.thresholdValue != null && data.exerciseId != null;
      }
      return true;
    },
    { message: 'Exercise-based badges require both thresholdValue and exerciseId', path: ['type'] },
  )
  .refine(
    (data) => {
      if (data.type === 'EXERCISE_MILESTONE') {
        return data.thresholdUnit != null;
      }
      return true;
    },
    { message: 'EXERCISE_MILESTONE badges require thresholdUnit', path: ['thresholdUnit'] },
  )
  .refine(
    (data) => {
      if (data.type === 'EXERCISE_MILESTONE' && data.thresholdUnit === 'SECONDS') {
        return data.durationCondition != null;
      }
      return true;
    },
    {
      message: 'Duration badges require durationCondition (longer or shorter is better)',
      path: ['durationCondition'],
    },
  );

export const updateBadgeDefinitionSchema = z.object({
  type: badgeTypeSchema.optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  howToEarn: z.string().max(500).optional().or(z.literal('')),
  icon: z.string().min(1).max(10).optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  thresholdValue: z.number().positive().optional().nullable(),
  thresholdUnit: thresholdUnitSchema.optional().nullable(),
  durationCondition: durationConditionSchema.optional().nullable(),
  exerciseId: cuidSchema.optional().nullable(),
  genderFilter: genderFilterSchema.optional(),
  isActive: z.boolean().optional(),
});

export const listBadgeDefinitionsSchema = paginationSchema.extend({
  type: badgeTypeSchema.optional(),
  search: z.string().optional(),
  genderFilter: genderFilterSchema.optional(),
});

// ─── TRAINER: SELF-SCHEDULING ────────────────────────
// Trainers may create/manage session schedules for their own assigned clients.
// Authorization layer enforces that trainerProfileId matches the requesting trainer
// and that an active PtPackage links the trainer to the client.

export const createTrainerScheduleSchema = z.object({
  clientProfileId: cuidSchema,
  dayOfWeek: dayOfWeekSchema,
  startTime: timeSchema,
  durationMin: z.number().int().positive(),
  validFrom: dateSchema,
  validUntil: dateSchema.optional(),
});

export const updateTrainerScheduleSchema = createTrainerScheduleSchema
  .omit({ clientProfileId: true })
  .partial()
  .extend({
    isActive: z.boolean().optional(),
  });

export const generateTrainerSessionsSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
  scheduleIds: z.array(cuidSchema).optional(),
  dryRun: z.boolean().optional(),
});

// ─── CLIENT: RESCHEDULE REQUESTS ─────────────────────

export const submitRescheduleRequestSchema = z.object({
  sessionInstanceId: cuidSchema,
  requestedDate: dateSchema,
  requestedTime: timeSchema,
  reason: z.string().max(500).optional(),
});

export const reviewRescheduleRequestSchema = z.object({
  reviewNotes: z.string().max(500).optional(),
});

export const listRescheduleRequestsSchema = paginationSchema.extend({
  status: rescheduleStatusSchema.optional(),
  clientId: cuidSchema.optional(),
  trainerId: cuidSchema.optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

// ─── ADMIN: TRAINER SHIFTS ───────────────────────────

export const createTrainerShiftApiSchema = z.object({
  trainerProfileId: cuidSchema,
  label: z.string().min(1).max(100),
  startTime: timeSchema,
  endTime: timeSchema,
  days: z.array(dayOfWeekSchema).min(1, 'At least one day is required'),
  effectiveFrom: z.string().datetime().optional(), // ISO datetime; defaults to now() if omitted
});

export const editTrainerShiftApiSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  days: z.array(dayOfWeekSchema).min(1).optional(),
  effectiveFrom: z.string().datetime(), // required — when the replacement shift kicks in
});

export const listTrainerShiftsSchema = z.object({
  trainerId: cuidSchema.optional(),
  includeScheduled: z.coerce.boolean().optional(), // also return future-dated shifts
  includeExpired: z.coerce.boolean().optional(), // also return already-expired shifts
});

export const createShiftSwapSchema = z.object({
  trainerAProfileId: cuidSchema,
  trainerBProfileId: cuidSchema,
  swapFrom: z.string().datetime(),
  swapUntil: z.string().datetime(),
  notes: z.string().max(500).optional(),
});

export const listShiftSwapsSchema = z.object({
  trainerId: cuidSchema.optional(),
  status: z.enum(['PENDING', 'APPROVED', 'CANCELLED']).optional(),
});

// ─── REST TIMER ──────────────────────────────────────
// Ephemeral session-scoped countdown. Either running (endTime set) or paused
// (pausedRemaining set) — never both. Capped at 1h to keep accidental
// 999999-second timers from sticking around.

const REST_TIMER_MAX_SECONDS = 60 * 60;

export const restTimerStateSchema = z
  .object({
    endTime: z.number().int().nullable(),
    pausedRemaining: z.number().int().min(0).max(REST_TIMER_MAX_SECONDS).nullable(),
    total: z.number().int().min(1).max(REST_TIMER_MAX_SECONDS).nullable(),
  })
  .refine((v) => !(v.endTime !== null && v.pausedRemaining !== null), {
    message: 'endTime and pausedRemaining are mutually exclusive',
  });

// Session-pause action body. PUT toggles pause; the API decides whether to
// pause or resume based on the current row state, so the client doesn't need
// to send anything except auth. Schema kept for parity / future extension.
export const sessionPauseActionSchema = z.object({}).optional();

// ─── TV DASHBOARD ────────────────────────────────────

export const tvDashboardQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format')
    .optional(),
});

export const createTvDeviceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
});

export const updateTvControlSchema = z
  .object({
    pinnedPanels: z.array(z.string().max(100)).max(20).optional(),
    shoutout: z.string().max(500).nullable().optional(),
    shoutoutTtlSec: z.number().int().min(5).max(600).optional(),
  })
  .refine((v) => v.pinnedPanels !== undefined || v.shoutout !== undefined, {
    message: 'At least one of pinnedPanels or shoutout must be provided',
  });

export const tvOptInSchema = z.object({
  showOnTv: z.boolean(),
});

export const createTvAnnouncementSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  body: z.string().trim().min(1, 'Body is required').max(800),
  icon: z.string().trim().max(8).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime({ message: 'Must be an ISO datetime' }).nullable().optional(),
});

export const updateTvAnnouncementSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    body: z.string().trim().min(1).max(800).optional(),
    icon: z.string().trim().max(8).nullable().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
    expiresAt: z.string().datetime({ message: 'Must be an ISO datetime' }).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });

export const createTvEventSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  description: z.string().trim().max(800).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  icon: z.string().trim().max(8).nullable().optional(),
  eventAt: z.string().datetime({ message: 'Must be an ISO datetime' }),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

export const updateTvEventSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(800).nullable().optional(),
    location: z.string().trim().max(200).nullable().optional(),
    icon: z.string().trim().max(8).nullable().optional(),
    eventAt: z.string().datetime({ message: 'Must be an ISO datetime' }).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });

// ─── TYPE EXPORTS ────────────────────────────────────

export type TrainerShiftInput = z.infer<typeof trainerShiftSchema>;
export type CreateTrainerShiftApiInput = z.infer<typeof createTrainerShiftApiSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateMappingInput = z.infer<typeof createMappingSchema>;
export type UpdateMappingInput = z.infer<typeof updateMappingSchema>;
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type GenerateSessionsInput = z.infer<typeof generateSessionsSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type BulkCreateSessionsInput = z.infer<typeof bulkCreateSessionsSchema>;
export type CreateReassignmentInput = z.infer<typeof createReassignmentSchema>;
export type BulkReassignmentInput = z.infer<typeof bulkReassignmentSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
export type CreateKickboxingClassInput = z.infer<typeof createKickboxingClassSchema>;
export type CreateKickboxingEnrollmentInput = z.infer<typeof createKickboxingEnrollmentSchema>;
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type WorkoutEntry = z.infer<typeof workoutEntrySchema>;
export type CreateWorkoutInput = z.infer<typeof createWorkoutSchema>;
export type ApplyLeaveInput = z.infer<typeof applyLeaveSchema>;
export type CreateProgressInput = z.infer<typeof createProgressSchema>;
export type UpdateProgressInput = z.infer<typeof updateProgressSchema>;
export type CreateUnavailabilityInput = z.infer<typeof createUnavailabilitySchema>;
export type CreateAvailabilityOverrideInput = z.infer<typeof createAvailabilityOverrideSchema>;
export type BulkCreateAvailabilityOverrideInput = z.infer<
  typeof bulkCreateAvailabilityOverrideSchema
>;
export type CreateBadgeDefinitionInput = z.infer<typeof createBadgeDefinitionSchema>;
export type UpdateBadgeDefinitionInput = z.infer<typeof updateBadgeDefinitionSchema>;
export type ListBadgeDefinitionsInput = z.infer<typeof listBadgeDefinitionsSchema>;
export type CreateTrainerScheduleInput = z.infer<typeof createTrainerScheduleSchema>;
export type UpdateTrainerScheduleInput = z.infer<typeof updateTrainerScheduleSchema>;
export type GenerateTrainerSessionsInput = z.infer<typeof generateTrainerSessionsSchema>;
export type SubmitRescheduleRequestInput = z.infer<typeof submitRescheduleRequestSchema>;
export type ReviewRescheduleRequestInput = z.infer<typeof reviewRescheduleRequestSchema>;
export type ListRescheduleRequestsInput = z.infer<typeof listRescheduleRequestsSchema>;
export type RestTimerStateInput = z.infer<typeof restTimerStateSchema>;
export type TvDashboardQueryInput = z.infer<typeof tvDashboardQuerySchema>;
export type CreateTvDeviceInput = z.infer<typeof createTvDeviceSchema>;
export type UpdateTvControlInput = z.infer<typeof updateTvControlSchema>;
export type TvOptInInput = z.infer<typeof tvOptInSchema>;
export type CreateTvAnnouncementInput = z.infer<typeof createTvAnnouncementSchema>;
export type UpdateTvAnnouncementInput = z.infer<typeof updateTvAnnouncementSchema>;
export type CreateTvEventInput = z.infer<typeof createTvEventSchema>;
export type UpdateTvEventInput = z.infer<typeof updateTvEventSchema>;
