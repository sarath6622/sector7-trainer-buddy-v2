import { describe, it, expect } from 'vitest';
import { notificationAction, notificationKind, roleBase } from '@/lib/notification-routing';

function n(title: string, metadata: Record<string, unknown> | null = null) {
  return { title, metadata };
}

describe('roleBase', () => {
  it('maps admin roles to admin', () => {
    expect(roleBase('SUPER_ADMIN')).toBe('admin');
    expect(roleBase('BRANCH_ADMIN')).toBe('admin');
  });

  it('maps all trainer roles to trainer', () => {
    expect(roleBase('TRAINER')).toBe('trainer');
    expect(roleBase('KICKBOXING_TRAINER')).toBe('trainer');
    expect(roleBase('CROSSFIT_TRAINER')).toBe('trainer');
  });

  it('maps client to client', () => {
    expect(roleBase('CLIENT')).toBe('client');
  });
});

describe('notificationKind', () => {
  it('classifies session types', () => {
    expect(notificationKind(n('x', { type: 'SESSION_STARTED' }))).toBe('session');
    expect(notificationKind(n('x', { type: 'SESSION_BOOKED' }))).toBe('session');
    expect(notificationKind(n('x', { type: 'SESSION_ASSIGNED' }))).toBe('session');
    expect(notificationKind(n('x', { type: 'SCHEDULE_CREATED' }))).toBe('session');
  });

  it('classifies leave types', () => {
    expect(notificationKind(n('x', { type: 'LEAVE_REQUESTED', leaveId: 'l1' }))).toBe('leave');
    expect(notificationKind(n('x', { type: 'LEAVE_APPROVED' }))).toBe('leave');
    expect(notificationKind(n('x', { type: 'LEAVE_REJECTED' }))).toBe('leave');
    expect(notificationKind(n('x', { type: 'TRAINER_ON_LEAVE' }))).toBe('leave');
  });

  it('classifies no-show as alert and reassignment', () => {
    expect(notificationKind(n('x', { type: 'NO_SHOW' }))).toBe('alert');
    expect(notificationKind(n('x', { type: 'TRAINER_REASSIGNED' }))).toBe('reassignment');
  });

  it('classifies reschedule notifications via rescheduleRequestId metadata', () => {
    expect(notificationKind(n('Reschedule Request', { rescheduleRequestId: 'r1' }))).toBe(
      'reschedule',
    );
  });

  it('falls back to title keywords when metadata has no type', () => {
    expect(notificationKind(n('Session Cancelled'))).toBe('session');
    expect(notificationKind(n('Sessions scheduled'))).toBe('session');
    expect(notificationKind(n('Payment received'))).toBe('payment');
    expect(notificationKind(n('Reschedule Approved'))).toBe('reschedule');
    expect(notificationKind(n('Welcome to Sector 7'))).toBe('generic');
  });
});

describe('notificationAction', () => {
  it('routes admins to the leaves page for leave requests', () => {
    const action = notificationAction(
      n('Leave request — Trainer A', { type: 'LEAVE_REQUESTED', leaveId: 'l1' }),
      'BRANCH_ADMIN',
    );
    expect(action.href).toBe('/admin/leaves');
  });

  it('routes trainers to their leaves page for leave outcomes', () => {
    expect(
      notificationAction(n('Leave approved', { type: 'LEAVE_APPROVED' }), 'TRAINER').href,
    ).toBe('/trainer/leaves');
    expect(
      notificationAction(n('Leave not approved', { type: 'LEAVE_REJECTED' }), 'TRAINER').href,
    ).toBe('/trainer/leaves');
  });

  it('routes clients to their sessions for session and leave notifications', () => {
    expect(
      notificationAction(n('Session scheduled', { type: 'SESSION_BOOKED' }), 'CLIENT').href,
    ).toBe('/client/sessions');
    expect(
      notificationAction(n('Trainer on leave', { type: 'TRAINER_ON_LEAVE' }), 'CLIENT').href,
    ).toBe('/client/sessions');
    expect(notificationAction(n('Session missed', { type: 'NO_SHOW' }), 'CLIENT').href).toBe(
      '/client/sessions',
    );
  });

  it('routes trainers to their schedule for new assignments', () => {
    expect(
      notificationAction(n('New session — Client', { type: 'SESSION_ASSIGNED' }), 'TRAINER').href,
    ).toBe('/trainer/schedule');
  });

  it('routes reschedule notifications per role', () => {
    const meta = { rescheduleRequestId: 'r1' };
    expect(notificationAction(n('Reschedule Request', meta), 'BRANCH_ADMIN').href).toBe(
      '/admin/reschedule-requests',
    );
    expect(notificationAction(n('Reschedule Approved', meta), 'TRAINER').href).toBe(
      '/trainer/reschedule-requests',
    );
    expect(notificationAction(n('Reschedule Approved', meta), 'CLIENT').href).toBe(
      '/client/reschedule-requests',
    );
  });

  it('falls back to the role dashboard for unknown notifications', () => {
    expect(notificationAction(n('Welcome to Sector 7'), 'CLIENT').href).toBe('/client');
    expect(notificationAction(n('Welcome to Sector 7'), 'SUPER_ADMIN').href).toBe('/admin');
  });
});
