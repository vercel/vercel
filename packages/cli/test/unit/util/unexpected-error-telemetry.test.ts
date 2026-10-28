import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/util/get-sentry', () => ({
  getSentry: vi.fn(async () => undefined),
}));
vi.mock('../../../src/util/report-error', () => ({
  default: vi.fn(async () => undefined),
}));

import { registerUnexpectedErrorHandlers } from '../../../src/util/unexpected-error';
import {
  recordCliError,
  takeCliError,
} from '../../../src/util/telemetry/cli-error';
import output from '../../../src/output-manager';

describe('unexpected error telemetry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records an unhandled rejection before handling it', () => {
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(output, 'error').mockImplementation(() => undefined);
    const on = vi.spyOn(process, 'on').mockImplementation(() => process);
    registerUnexpectedErrorHandlers(() => undefined);
    const onRejection = on.mock.calls.find(
      ([event]) => event === 'unhandledRejection'
    )?.[1] as (err: unknown) => Promise<void>;
    takeCliError();

    // Recording happens synchronously, before the handler's first await
    void onRejection(new TypeError('x is undefined')).catch(() => {});

    expect(takeCliError()).toMatchObject({ code: 'TypeError' });
  });

  it('keeps an error the command already recorded', () => {
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(output, 'error').mockImplementation(() => undefined);
    const on = vi.spyOn(process, 'on').mockImplementation(() => process);
    registerUnexpectedErrorHandlers(() => undefined);
    const onRejection = on.mock.calls.find(
      ([event]) => event === 'unhandledRejection'
    )?.[1] as (err: unknown) => Promise<void>;
    takeCliError();
    recordCliError({ code: 'not_found' });

    void onRejection(new TypeError('update check failed')).catch(() => {});

    expect(takeCliError()).toMatchObject({ code: 'not_found' });
  });
});
