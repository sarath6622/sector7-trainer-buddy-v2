/**
 * Role helpers shared by the server, the edge middleware and the client shell.
 * Pure TypeScript, no Prisma, so it is safe to import from `middleware.ts`.
 *
 * ADR-054: a user may hold several roles. "Head Coach" is not an enum value,
 * it is an admin role plus a trainer role. Such a user can open both the
 * /admin and /trainer surfaces and switches between them from the top bar.
 */

export const ADMIN_ROLES = ['SUPER_ADMIN', 'BRANCH_ADMIN'] as const;
export const TRAINER_ROLES = ['TRAINER', 'KICKBOXING_TRAINER', 'CROSSFIT_TRAINER'] as const;
export const STAFF_ROLES = [...ADMIN_ROLES, ...TRAINER_ROLES] as const;

export type Surface = 'admin' | 'trainer' | 'client';
export type AccessLevel = 'ADMIN' | 'HEAD_COACH' | 'TRAINER';

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  ADMIN: 'Admin',
  HEAD_COACH: 'Head Coach',
  TRAINER: 'Trainer',
};

/** Cookie remembering which surface a multi-surface user last used. */
export const SURFACE_COOKIE = 's7_surface';

const ROLE_PRIORITY: Record<string, number> = {
  SUPER_ADMIN: 0,
  BRANCH_ADMIN: 1,
  TRAINER: 2,
  KICKBOXING_TRAINER: 3,
  CROSSFIT_TRAINER: 4,
  CLIENT: 5,
};

const ROLE_SURFACE: Record<string, Surface> = {
  SUPER_ADMIN: 'admin',
  BRANCH_ADMIN: 'admin',
  TRAINER: 'trainer',
  KICKBOXING_TRAINER: 'trainer',
  CROSSFIT_TRAINER: 'trainer',
  CLIENT: 'client',
};

const SURFACE_ORDER: Surface[] = ['admin', 'trainer', 'client'];

function byPriority(a: string, b: string) {
  return (ROLE_PRIORITY[a] ?? 999) - (ROLE_PRIORITY[b] ?? 999);
}

/** Highest-priority role. Kept on the session as `role` for display and legacy callers. */
export function computePrimaryRole(roles: readonly string[]): string {
  return [...roles].sort(byPriority)[0] || 'CLIENT';
}

export function isAdminRoles(roles: readonly string[]): boolean {
  return roles.some((r) => (ADMIN_ROLES as readonly string[]).includes(r));
}

export function isTrainerRoles(roles: readonly string[]): boolean {
  return roles.some((r) => (TRAINER_ROLES as readonly string[]).includes(r));
}

/** null for users who hold no staff role (clients, TV displays). */
export function accessLevelOf(roles: readonly string[]): AccessLevel | null {
  const admin = isAdminRoles(roles);
  const trainer = isTrainerRoles(roles);
  if (admin && trainer) return 'HEAD_COACH';
  if (admin) return 'ADMIN';
  if (trainer) return 'TRAINER';
  return null;
}

/** Surfaces this user may open, in priority order (admin, trainer, client). */
export function surfacesFor(roles: readonly string[]): Surface[] {
  const held = new Set(roles.map((r) => ROLE_SURFACE[r]).filter(Boolean));
  return SURFACE_ORDER.filter((s) => held.has(s));
}

/** The surface a dashboard path belongs to, or null for shared pages (/community, /notifications). */
export function surfaceOf(pathname: string): Surface | null {
  for (const s of SURFACE_ORDER) {
    if (pathname === `/${s}` || pathname.startsWith(`/${s}/`)) return s;
  }
  return null;
}

/** Roles that drive the nav for one surface, highest priority first. */
export function rolesForSurface(roles: readonly string[], surface: Surface): string[] {
  return roles.filter((r) => ROLE_SURFACE[r] === surface).sort(byPriority);
}

/**
 * Where to land a user with no explicit destination. A remembered surface wins
 * when the user still holds it; otherwise the highest-priority surface.
 */
export function defaultPathFor(
  roles: readonly string[],
  preferred?: string | null,
): string | undefined {
  const surfaces = surfacesFor(roles);
  if (preferred && surfaces.includes(preferred as Surface)) return `/${preferred}`;
  return surfaces[0] ? `/${surfaces[0]}` : undefined;
}

/** Display label: "Head Coach" for the combo, otherwise the primary role in words. */
export function roleLabel(roles: readonly string[]): string {
  const level = accessLevelOf(roles);
  if (level === 'HEAD_COACH') return ACCESS_LEVEL_LABELS.HEAD_COACH;
  return computePrimaryRole(roles).replace(/_/g, ' ');
}

export interface ActiveSurface {
  /** Surface the shell is rendering (current path, else remembered, else highest priority). */
  surface: Surface | null;
  /** Roles whose nav makes up this surface, highest priority first. */
  surfaceRoles: string[];
  /** Representative role for role-keyed UI (tab bar, notification links). */
  activeRole: string;
  /** Every surface the user may switch to. */
  surfaces: Surface[];
}

export function resolveActiveSurface(
  roles: readonly string[],
  pathname: string,
  preferred?: string | null,
): ActiveSurface {
  const surfaces = surfacesFor(roles);
  const fromPath = surfaceOf(pathname);
  const surface =
    (fromPath && surfaces.includes(fromPath) ? fromPath : null) ??
    (preferred && surfaces.includes(preferred as Surface) ? (preferred as Surface) : null) ??
    surfaces[0] ??
    null;
  const surfaceRoles = surface ? rolesForSurface(roles, surface) : [];
  return {
    surface,
    surfaceRoles,
    activeRole: surfaceRoles[0] ?? computePrimaryRole(roles),
    surfaces,
  };
}
