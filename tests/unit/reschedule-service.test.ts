import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    sessionInstance: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    rescheduleRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ sendNotification: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { sendNotification } from '@/lib/notifications';
import * as rescheduleService from '@/services/reschedule.service';

const BRANCH = 'branch-1';
const ACTOR = 'client-user-1';
const SESSION_ID = 'sess-1';
const REQUEST_ID = 'req-1';
const CLIENT_PROFILE_ID = 'cp-1';

const mockSession = {
  id: SESSION_ID,
  status: 'SCHEDULED',
  branchId: BRANCH,
  clientProfileId: CLIENT_PROFILE_ID,
  trainerProfileId: 'tp-1',
  scheduledDate: new Date('2026-04-20T00:00:00.000Z'),
  scheduledTime: '10:00',
  durationMin: 60,
  trainer: { user: { id: 'trainer-user-1', firstName: 'Dev', lastName: 'Trainer' } },
  client: { user: { firstName: 'Alice', lastName: 'Client' } },
};

const mockRequest = {
  id: REQUEST_ID,
  branchId: BRANCH,
  sessionInstanceId: SESSION_ID,
  clientProfileId: CLIENT_PROFILE_ID,
  requestedDate: new Date('2026-04-22T00:00:00.000Z'),
  requestedTime: '11:00',
  reason: 'Travel',
  status: 'PENDING',
  sessionInstance: {
    ...mockSession,
    client: { user: { id: ACTOR, firstName: 'Alice', lastName: 'Client' } },
  },
  client: { user: { id: ACTOR, firstName: 'Alice', lastName: 'Client' } },
};

beforeEach(() => vi.resetAllMocks());

// ─── submitRescheduleRequest ──────────────────────────────────────────────────

describe('submitRescheduleRequest', () => {
  const input = {
    branchId: BRANCH,
    sessionInstanceId: SESSION_ID,
    clientProfileId: CLIENT_PROFILE_ID,
    actorId: ACTOR,
    requestedDate: '2026-04-22',
    requestedTime: '11:00',
    reason: 'Travel',
  };

  it('throws 404 if session does not exist or does not belong to client', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(rescheduleService.submitRescheduleRequest(input)).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws 400 if session status is not SCHEDULED', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockSession,
      status: 'COMPLETED',
    });
    await expect(rescheduleService.submitRescheduleRequest(input)).rejects.toMatchObject({
      code: 'SESSION_NOT_RESCHEDULABLE',
      statusCode: 400,
    });
  });

  it('throws 409 if a PENDING request already exists for the session', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);
    (prisma.rescheduleRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'existing-req',
      status: 'PENDING',
    });
    await expect(rescheduleService.submitRescheduleRequest(input)).rejects.toMatchObject({
      code: 'PENDING_REQUEST_EXISTS',
      statusCode: 409,
    });
  });

  it('creates request, writes audit log, and notifies admin + trainer on success', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);
    (prisma.rescheduleRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.rescheduleRequest.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockRequest);
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'admin-user-1' }]);

    const result = await rescheduleService.submitRescheduleRequest(input);

    // Request created
    expect(prisma.rescheduleRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId: BRANCH,
          sessionInstanceId: SESSION_ID,
          clientProfileId: CLIENT_PROFILE_ID,
          requestedTime: '11:00',
          status: 'PENDING',
        }),
      }),
    );

    // Audit log written
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RESCHEDULE_REQUEST_SUBMITTED',
        actorId: ACTOR,
        subjectId: REQUEST_ID,
        branchId: BRANCH,
      }),
    );

    // Admin notified
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'admin-user-1', branchId: BRANCH }),
    );

    // Trainer notified
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'trainer-user-1', branchId: BRANCH }),
    );

    expect(result.id).toBe(REQUEST_ID);
  });
});

// ─── approveReschedule ────────────────────────────────────────────────────────

describe('approveReschedule', () => {
  const input = {
    id: REQUEST_ID,
    branchId: BRANCH,
    actorId: 'admin-user-1',
    reviewNotes: 'Approved',
  };

  it('throws 404 if request not found', async () => {
    (prisma.rescheduleRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(rescheduleService.approveReschedule(input)).rejects.toMatchObject({
      code: 'REQUEST_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws 409 if request is not PENDING', async () => {
    (prisma.rescheduleRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockRequest,
      status: 'APPROVED',
    });
    await expect(rescheduleService.approveReschedule(input)).rejects.toMatchObject({
      code: 'REQUEST_ALREADY_REVIEWED',
      statusCode: 409,
    });
  });

  it('updates session date/time, marks request APPROVED, writes audit log, and notifies client', async () => {
    (prisma.rescheduleRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockRequest);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([{}, {}]);

    await rescheduleService.approveReschedule(input);

    // Session instance rescheduled to the requested date/time
    expect(prisma.sessionInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SESSION_ID },
        data: expect.objectContaining({
          scheduledDate: mockRequest.requestedDate,
          scheduledTime: mockRequest.requestedTime,
        }),
      }),
    );

    // Request marked APPROVED with reviewer info
    expect(prisma.rescheduleRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REQUEST_ID },
        data: expect.objectContaining({
          status: 'APPROVED',
          reviewedByUserId: 'admin-user-1',
          reviewNotes: 'Approved',
        }),
      }),
    );

    // Audit log
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RESCHEDULE_REQUEST_APPROVED',
        actorId: 'admin-user-1',
        subjectId: REQUEST_ID,
        branchId: BRANCH,
      }),
    );

    // Client notified
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: ACTOR,
        branchId: BRANCH,
        title: 'Reschedule Approved',
      }),
    );
  });
});

// ─── rejectReschedule ─────────────────────────────────────────────────────────

describe('rejectReschedule', () => {
  const input = {
    id: REQUEST_ID,
    branchId: BRANCH,
    actorId: 'admin-user-1',
    reviewNotes: 'Not possible that day',
  };

  it('throws 404 if request not found', async () => {
    (prisma.rescheduleRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(rescheduleService.rejectReschedule(input)).rejects.toMatchObject({
      code: 'REQUEST_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws 409 if request is already reviewed', async () => {
    (prisma.rescheduleRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockRequest,
      status: 'REJECTED',
    });
    await expect(rescheduleService.rejectReschedule(input)).rejects.toMatchObject({
      code: 'REQUEST_ALREADY_REVIEWED',
      statusCode: 409,
    });
  });

  it('marks request REJECTED, writes audit log, and notifies client with reason', async () => {
    const rejectableRequest = {
      ...mockRequest,
      sessionInstance: {
        scheduledDate: new Date('2026-04-18T00:00:00.000Z'),
        scheduledTime: '10:00',
      },
    };
    (prisma.rescheduleRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      rejectableRequest,
    );
    (prisma.rescheduleRequest.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...rejectableRequest,
      status: 'REJECTED',
    });

    await rescheduleService.rejectReschedule(input);

    expect(prisma.rescheduleRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REQUEST_ID },
        data: expect.objectContaining({
          status: 'REJECTED',
          reviewedByUserId: 'admin-user-1',
          reviewNotes: 'Not possible that day',
        }),
      }),
    );

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RESCHEDULE_REQUEST_REJECTED',
        actorId: 'admin-user-1',
        subjectId: REQUEST_ID,
        branchId: BRANCH,
      }),
    );

    // Client notified with decline message and review notes
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: ACTOR,
        branchId: BRANCH,
        title: 'Reschedule Request Declined',
        body: expect.stringContaining('Not possible that day'),
      }),
    );
  });

  it('does not include review notes in notification body when none provided', async () => {
    const rejectableRequest = {
      ...mockRequest,
      sessionInstance: {
        scheduledDate: new Date('2026-04-18T00:00:00.000Z'),
        scheduledTime: '10:00',
      },
    };
    (prisma.rescheduleRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      rejectableRequest,
    );
    (prisma.rescheduleRequest.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...rejectableRequest,
      status: 'REJECTED',
    });

    await rescheduleService.rejectReschedule({ ...input, reviewNotes: undefined });

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.not.stringContaining('Reason:'),
      }),
    );
  });
});
