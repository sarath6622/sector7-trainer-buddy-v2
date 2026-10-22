import { STAFF_ROLES } from '@/lib/roles';

/**
 * Why a user with the right password still can't get in (ADR-055).
 *
 * `MEMBERSHIP_INACTIVE` — a client who has left the gym (`User.isActive=false`).
 * `ACCOUNT_DISABLED`   — a deactivated staff account (Staff & Access) or a deleted user.
 *
 * The code travels as the thrown `authorize()` error message (NextAuth hands it
 * back to `signIn()` as `result.error`) and as `?reason=` on /login when an
 * already signed-in user is cut off. Client-safe: no server imports.
 */
export type AccessBlockedReason = 'MEMBERSHIP_INACTIVE' | 'ACCOUNT_DISABLED';

export const ACCESS_BLOCKED_COPY: Record<AccessBlockedReason, { title: string; body: string }> = {
  MEMBERSHIP_INACTIVE: {
    title: 'Membership inactive',
    body: 'Your Sector 7 membership has ended, so app access is paused. Renew your membership at the front desk to get back in.',
  },
  ACCOUNT_DISABLED: {
    title: 'Account disabled',
    body: 'This account is no longer active. Ask a gym admin to restore your access.',
  },
};

export function isAccessBlockedReason(value: unknown): value is AccessBlockedReason {
  return value === 'MEMBERSHIP_INACTIVE' || value === 'ACCOUNT_DISABLED';
}

/** Null when the user may sign in. Staff wording wins over membership wording. */
export function accessBlockedReason(user: {
  isActive: boolean;
  deletedAt: Date | null;
  roles: readonly string[];
}): AccessBlockedReason | null {
  if (user.isActive && !user.deletedAt) return null;
  const isStaff = user.roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
  return !user.deletedAt && !isStaff ? 'MEMBERSHIP_INACTIVE' : 'ACCOUNT_DISABLED';
}
