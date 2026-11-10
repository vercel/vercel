import {
  getInternalServiceCronPath,
  getInternalServiceCronPathPrefix,
  getInternalServiceFunctionPath,
  getInternalServiceWorkerPath,
  getInternalServiceWorkerPathPrefix,
} from '../src';
import { describe, expect, it } from 'vitest';

describe('service path utilities', () => {
  it('generates function, cron, and worker paths', () => {
    expect(getInternalServiceFunctionPath('api')).toBe('/_svc/api/index');
    expect(getInternalServiceCronPathPrefix('api')).toBe('/_svc/api/crons');
    expect(getInternalServiceCronPath('api', '/tasks/daily.ts')).toBe(
      '/_svc/api/crons/tasks/daily/cron'
    );
    expect(getInternalServiceWorkerPathPrefix('api')).toBe('/_svc/api/workers');
    expect(
      getInternalServiceWorkerPath('api', 'workers/email.ts', 'consume')
    ).toBe('/_svc/api/workers/workers/email/consume');
  });
});
