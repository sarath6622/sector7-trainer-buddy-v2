/** Standard API success response */
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

/** Standard API error response */
export interface ApiError {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** Scheduling conflict between two sessions */
export interface Conflict {
  sessionA: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
    clientName: string;
  };
  sessionB: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
    clientName: string;
  };
  trainer: {
    id: string;
    name: string;
  };
  overlapMinutes: number;
}

/** Session start response */
export interface SessionStartResponse {
  session: {
    id: string;
    status: string;
    startedAt: string;
  };
  timer: {
    startedAt: string;
    expectedDurationMin: number;
  };
}

/** Session end response */
export interface SessionEndResponse {
  session: {
    id: string;
    status: string;
    endedAt: string;
  };
  actualDurationMin: number;
}

/** Client dashboard summary */
export interface ClientDashboard {
  sessionCount: {
    total: number;
    used: number;
    remaining: number;
    carryForward: number;
  };
  nextSession: {
    id: string;
    date: string;
    time: string;
    trainerName: string;
  } | null;
  recentWorkouts: {
    id: string;
    date: string;
    exerciseCount: number;
  }[];
  progress: {
    latestWeight: number | null;
    latestBodyFat: number | null;
    trend: 'up' | 'down' | 'stable' | null;
  };
}

/** Trainer analytics summary */
export interface TrainerAnalytics {
  clientAttendanceRate: number;
  sessionCompletionRate: number;
  utilization: number;
}

/** Revenue overview for admin dashboard */
export interface RevenueOverview {
  totalRevenue: number;
  collectedAmount: number;
  pendingAmount: number;
  overdueAmount: number;
}

/** Offline workout sync conflict */
export interface SyncConflict {
  localTimestamp: string;
  serverTimestamp: string;
  sessionInstanceId: string;
  resolution: 'local_wins' | 'server_wins';
}

/** Chart data point for progress visualization */
export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

/** Bulk import error detail */
export interface ImportError {
  row: number;
  field: string;
  message: string;
}

/** Session consumption per client for month-end */
export interface SessionConsumption {
  clientId: string;
  clientName: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  carryForwardSessions: number;
}
