export {
  UserRole,
  SessionStatus,
  LeaveStatus,
  PaymentStatus,
  PaymentMethod,
  NotificationChannel,
  NotificationStatus,
  DayOfWeek,
  KickboxingClientType,
  DifficultyLevel,
  ExerciseCategory,
} from '@prisma/client';

// AttendanceStatus is defined in schema but not attached to a model field yet.
// Defined here for use in services/types until a model field references it.
export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  NO_SHOW = 'NO_SHOW',
  UNAVAILABLE = 'UNAVAILABLE',
}
