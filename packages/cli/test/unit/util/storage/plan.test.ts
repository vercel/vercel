import { describe, expect, it } from 'vitest';
import {
  formatStoragePlan,
  type StoragePlan,
} from '../../../../src/util/storage/plan';

describe('storage plan variable names', () => {
  it.each([
    'connect',
    'update',
    'disconnect',
  ] as const)('distinguishes unknown names from a known empty %s change set', action => {
    const plan: StoragePlan = {
      action,
      dryRun: true,
      store: {
        id: 'store_123',
        name: 'database',
        type: 'integration',
        product: 'Acme',
      },
      projects: [{ id: 'prj_123', name: 'app' }],
      environments: ['development'],
      envVarPrefix: null,
      envVars: { add: [], remove: [], keep: [], source: 'provider', notes: [] },
    };
    expect(formatStoragePlan(plan)).toContain('names unavailable');
    expect(formatStoragePlan(plan)).not.toContain('no changes');
    plan.envVars.source = 'connection';
    expect(formatStoragePlan(plan)).toContain('no changes');
    expect(formatStoragePlan(plan)).not.toContain('names unavailable');
  });
});
