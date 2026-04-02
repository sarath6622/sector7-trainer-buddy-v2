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
  'CLIENT',
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

export const kickboxingClientTypeSchema = z.enum(['GYM_MEMBER', 'EXTERNAL_ONLY']);

export const difficultyLevelSchema = z.enum(['EASY', 'MEDIUM', 'HARD']);

export const exerciseTypeSchema = z.enum(['WEIGHTED', 'BODYWEIGHT', 'DURATION', 'CARDIO']);

export const exerciseCategorySchema = z.enum([
  'HYPERTROPHY',
  'CARDIO',
  'FLEXIBILITY',
  'STRENGTH',
  'FUNCTIONAL',
]);

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
  role: userRoleSchema,
  password: z.string().min(6),
  // Trainer-specific optional fields
  specialties: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  bio: z.string().optional(),
  workingHoursStart: timeSchema.optional(),
  workingHoursEnd: timeSchema.optional(),
  workingDays: z.array(dayOfWeekSchema).optional(),
  // Client-specific optional fields
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
  sessionsPerMonth: z.number().int().positive(),
  sessionCharge: z.number().min(0).optional(),
  startDate: dateSchema,
});

export const updateMappingSchema = z.object({
  sessionsPerMonth: z.number().int().positive().optional(),
  sessionCharge: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
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
  instructions: z.string().optional(),
  demoVideoUrl: z.string().url().optional(),
  demoGifUrl: z.string().url().optional(),
});

export const updateExerciseSchema = createExerciseSchema.partial();

export const listExercisesSchema = paginationSchema.extend({
  search: z.string().optional(),
  muscleGroup: z.string().optional(),
  category: exerciseCategorySchema.optional(),
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
  notes: z.string().optional(),
});

export const workoutEntrySchema = z.object({
  exerciseId: cuidSchema,
  orderIndex: z.number().int().min(0),
  sets: z.array(workoutSetSchema).min(1),
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

// ─── TYPE EXPORTS ────────────────────────────────────

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
