import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';
import { setTelemetryReporter } from '../../../src/util/telemetry/reporter';
import { validateConfig } from '../../../src/util/validate-config';

let telemetry: RootTelemetryClient;
let store: TelemetryEventStore;

beforeEach(() => {
  vi.stubEnv('VERCEL_CLI_TELEMETRY_V2', '1');
  store = new TelemetryEventStore({ isDebug: true, config: {} });
  telemetry = new RootTelemetryClient({ opts: { store } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  setTelemetryReporter(undefined);
});

describe('help_rendered', () => {
  it('tracks the help context', () => {
    telemetry.trackHelpRendered('root');
    expect(store.readonlyEvents).toMatchObject([
      { key: 'help_rendered', value: 'root' },
    ]);
  });
});

describe('docs_link_shown', () => {
  it('is emitted from trackError when the error carries a link', () => {
    telemetry.trackError(
      Object.assign(new Error('x'), {
        code: 'NO_CREDENTIALS',
        link: 'https://err.sh/vercel/no-credentials-found',
      })
    );
    expect(store.readonlyEvents).toMatchObject([
      { key: 'error_code', value: 'NO_CREDENTIALS' },
      { key: 'docs_link_shown', value: 'vercel/no-credentials-found' },
    ]);
  });

  it('redacts non-vercel links', () => {
    telemetry.trackError(
      Object.assign(new Error('x'), { link: 'https://evil.example.com/x' })
    );
    expect(
      store.readonlyEvents.find(e => e.key === 'docs_link_shown')?.value
    ).toBe('[REDACTED]');
  });
});

describe('project config events', () => {
  it('tracks parse and explicit-not-found errors', () => {
    telemetry.trackProjectConfigError('parse');
    telemetry.trackProjectConfigError('not_found_explicit');
    expect(store.readonlyEvents.map(e => e.value)).toEqual([
      'parse',
      'not_found_explicit',
    ]);
  });

  it('tracks validation error codes from validateConfig', () => {
    setTelemetryReporter(telemetry);
    const error = validateConfig({
      functions: { 'api/test.js': { memory: 128 } },
      builds: [{ src: 'x', use: 'y' }],
    } as never);
    expect(error?.code).toBeTruthy();
    expect(store.readonlyEvents).toMatchObject([
      { key: 'project_config_validation', value: error?.code },
    ]);
  });

  it('emits nothing from validateConfig for valid configs', () => {
    setTelemetryReporter(telemetry);
    expect(validateConfig({} as never)).toBeNull();
    expect(store.readonlyEvents).toHaveLength(0);
  });

  it('redacts unexpected code shapes', () => {
    telemetry.trackProjectConfigValidation('has spaces!');
    expect(store.readonlyEvents[0]?.value).toBe('[REDACTED]');
  });
});

describe('cli config events', () => {
  it('tracks config and auth-config failures', () => {
    telemetry.trackConfigError('read');
    telemetry.trackAuthConfigError('read');
    expect(store.readonlyEvents).toMatchObject([
      { key: 'config_error', value: 'read' },
      { key: 'auth_config_error', value: 'read' },
    ]);
  });

  it('tracks nothing without v2', () => {
    vi.stubEnv('VERCEL_CLI_TELEMETRY_V2', '');
    telemetry.trackHelpRendered('root');
    telemetry.trackProjectConfigError('parse');
    telemetry.trackConfigError('read');
    telemetry.trackAuthConfigError('read');
    telemetry.trackProjectConfigValidation('X');
    expect(store.readonlyEvents).toHaveLength(0);
  });
});
