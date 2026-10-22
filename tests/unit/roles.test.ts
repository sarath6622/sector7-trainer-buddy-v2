import { describe, it, expect } from 'vitest';
import {
  accessLevelOf,
  computePrimaryRole,
  defaultPathFor,
  resolveActiveSurface,
  roleLabel,
  surfaceOf,
  surfacesFor,
} from '@/lib/roles';

const HEAD_COACH = ['BRANCH_ADMIN', 'TRAINER'];

describe('accessLevelOf', () => {
  it('classifies admin, head coach and trainer', () => {
    expect(accessLevelOf(['BRANCH_ADMIN'])).toBe('ADMIN');
    expect(accessLevelOf(['SUPER_ADMIN'])).toBe('ADMIN');
    expect(accessLevelOf(HEAD_COACH)).toBe('HEAD_COACH');
    expect(accessLevelOf(['SUPER_ADMIN', 'CROSSFIT_TRAINER'])).toBe('HEAD_COACH');
    expect(accessLevelOf(['TRAINER', 'CROSSFIT_TRAINER'])).toBe('TRAINER');
  });

  it('returns null for non-staff', () => {
    expect(accessLevelOf(['CLIENT'])).toBeNull();
    expect(accessLevelOf(['TV_DISPLAY'])).toBeNull();
    expect(accessLevelOf([])).toBeNull();
  });
});

describe('surfaces', () => {
  it('a head coach can open admin and trainer, admin first', () => {
    expect(surfacesFor(['TRAINER', 'BRANCH_ADMIN'])).toEqual(['admin', 'trainer']);
  });

  it('trainer specialisations collapse to one surface', () => {
    expect(surfacesFor(['TRAINER', 'CROSSFIT_TRAINER'])).toEqual(['trainer']);
  });

  it('TV displays get no dashboard surface', () => {
    expect(surfacesFor(['TV_DISPLAY'])).toEqual([]);
  });

  it('maps paths to surfaces without prefix collisions', () => {
    expect(surfaceOf('/admin')).toBe('admin');
    expect(surfaceOf('/trainer/session/abc')).toBe('trainer');
    expect(surfaceOf('/community')).toBeNull();
    expect(surfaceOf('/administrator')).toBeNull();
  });
});

describe('defaultPathFor', () => {
  it('lands a head coach on admin by default', () => {
    expect(defaultPathFor(HEAD_COACH)).toBe('/admin');
  });

  it('honours a remembered surface the user still holds', () => {
    expect(defaultPathFor(HEAD_COACH, 'trainer')).toBe('/trainer');
  });

  it('ignores a remembered surface the user no longer holds', () => {
    expect(defaultPathFor(['BRANCH_ADMIN'], 'trainer')).toBe('/admin');
  });

  it('has no landing for a user with no roles (revoked)', () => {
    expect(defaultPathFor([])).toBeUndefined();
  });
});

describe('resolveActiveSurface', () => {
  it('follows the URL for a head coach', () => {
    const onTrainer = resolveActiveSurface(HEAD_COACH, '/trainer/clients');
    expect(onTrainer.surface).toBe('trainer');
    expect(onTrainer.activeRole).toBe('TRAINER');
    expect(onTrainer.surfaceRoles).toEqual(['TRAINER']);

    const onAdmin = resolveActiveSurface(HEAD_COACH, '/admin/sessions');
    expect(onAdmin.surface).toBe('admin');
    expect(onAdmin.activeRole).toBe('BRANCH_ADMIN');
  });

  it('uses the remembered surface on shared pages', () => {
    expect(resolveActiveSurface(HEAD_COACH, '/community', 'trainer').surface).toBe('trainer');
    expect(resolveActiveSurface(HEAD_COACH, '/community').surface).toBe('admin');
  });

  it('keeps all trainer specialisations on the trainer side', () => {
    const r = resolveActiveSurface(['CROSSFIT_TRAINER', 'TRAINER'], '/trainer');
    expect(r.surfaceRoles).toEqual(['TRAINER', 'CROSSFIT_TRAINER']);
  });
});

describe('labels', () => {
  it('shows Head Coach for the combo, otherwise the primary role', () => {
    expect(roleLabel(HEAD_COACH)).toBe('Head Coach');
    expect(roleLabel(['BRANCH_ADMIN'])).toBe('BRANCH ADMIN');
    expect(roleLabel(['KICKBOXING_TRAINER'])).toBe('KICKBOXING TRAINER');
  });

  it('primary role prefers admin', () => {
    expect(computePrimaryRole(['CLIENT', 'TRAINER', 'BRANCH_ADMIN'])).toBe('BRANCH_ADMIN');
  });
});
