/**
 * Notification deep-link routing.
 *
 * Every in-app notification carries `metadata.type` (see
 * services/notification.service.ts) or a `rescheduleRequestId`
 * (services/reschedule.service.ts). This module resolves a notification to:
 *   - a visual kind (icon/colour bucket for the UI)
 *   - an action: the page the recipient should land on + a button label
 *
 * Routes are resolved against the recipient's role so the same notification
 * type lands on the right surface for admins, trainers and clients.
 */

export type NotificationKind =
  | 'session'
  | 'leave'
  | 'reschedule'
  | 'reassignment'
  | 'payment'
  | 'alert'
  | 'generic';

export interface RoutableNotification {
  title: string;
  metadata: Record<string, unknown> | null;
}

export type RoleBase = 'admin' | 'trainer' | 'client';

export interface NotificationAction {
  href: string;
  label: string;
}

export function roleBase(role: string): RoleBase {
  if (role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN') return 'admin';
  if (role === 'CLIENT') return 'client';
  // TRAINER, KICKBOXING_TRAINER, CROSSFIT_TRAINER
  return 'trainer';
}

/** Where "sessions" live for each role. */
const SESSION_ROUTE: Record<RoleBase, string> = {
  admin: '/admin/sessions',
  trainer: '/trainer/schedule',
  client: '/client/sessions',
};

const LEAVE_ROUTE: Record<RoleBase, string> = {
  admin: '/admin/leaves',
  trainer: '/trainer/leaves',
  client: '/client/sessions',
};

export function notificationKind(n: RoutableNotification): NotificationKind {
  if (n.metadata && 'rescheduleRequestId' in n.metadata) return 'reschedule';

  const type = typeof n.metadata?.type === 'string' ? n.metadata.type : '';
  switch (type) {
    case 'SESSION_STARTED':
    case 'SESSION_BOOKED':
    case 'SESSION_ASSIGNED':
    case 'SCHEDULE_CREATED':
      return 'session';
    case 'NO_SHOW':
    case 'SESSION_OVERRUN':
    case 'SESSION_AUTO_CLOSED':
      return 'alert';
    case 'LEAVE_REQUESTED':
    case 'LEAVE_APPROVED':
    case 'LEAVE_REJECTED':
    case 'TRAINER_ON_LEAVE':
      return 'leave';
    case 'TRAINER_REASSIGNED':
      return 'reassignment';
  }

  // Older notifications (e.g. session cancellations, bulk scheduling) carry no
  // metadata type — classify by title so they still get an icon and a route.
  const title = n.title.toLowerCase();
  if (title.includes('reschedule')) return 'reschedule';
  if (title.includes('payment')) return 'payment';
  if (title.includes('leave')) return 'leave';
  if (title.includes('session')) return 'session';
  return 'generic';
}

export function notificationAction(n: RoutableNotification, role: string): NotificationAction {
  const base = roleBase(role);

  // Overrun / auto-close notifications name their session, and only the
  // trainer can act on one — send them to that session's screen (which has
  // the End button) instead of the generic schedule list. Admins fall through
  // to /admin/sessions via the 'alert' branch below.
  const type = typeof n.metadata?.type === 'string' ? n.metadata.type : '';
  const sessionInstanceId =
    typeof n.metadata?.sessionInstanceId === 'string' ? n.metadata.sessionInstanceId : '';
  if (base === 'trainer' && sessionInstanceId) {
    if (type === 'SESSION_OVERRUN') {
      return { href: `/trainer/session/${sessionInstanceId}`, label: 'End session' };
    }
    if (type === 'SESSION_AUTO_CLOSED') {
      return { href: `/trainer/session/${sessionInstanceId}`, label: 'View session' };
    }
  }

  switch (notificationKind(n)) {
    case 'reschedule':
      return { href: `/${base}/reschedule-requests`, label: 'View request' };
    case 'leave':
      // Clients are told their trainer is on leave — the actionable surface
      // for them is their session list, not a leave page.
      if (base === 'client') return { href: LEAVE_ROUTE.client, label: 'View sessions' };
      return {
        href: LEAVE_ROUTE[base],
        label: base === 'admin' ? 'Review leave' : 'View leaves',
      };
    case 'session':
    case 'alert':
    case 'reassignment':
      return {
        href: SESSION_ROUTE[base],
        label: base === 'trainer' ? 'View schedule' : 'View sessions',
      };
    case 'payment':
      if (base === 'admin') return { href: '/admin/clients', label: 'View clients' };
      return { href: `/${base}`, label: 'Open' };
    default:
      return { href: `/${base}`, label: 'Open' };
  }
}
