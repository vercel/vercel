import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import {
  ENDPOINT_URL,
  expectTeamScoped,
  run,
  savedConfig,
  secretMetadata,
  stderr,
  stdout,
  stdoutJson,
  useInferenceHooksApi,
} from './inference-hooks-helpers';

describe('ai-gateway inference-hooks status', () => {
  it('shows the configuration and signing secret on stdout', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: { ...savedConfig, enabled: true } }),
      getSecret: () => ({ body: secretMetadata }),
    });

    expect(await run('status')).toBe(0);

    const out = stdout();
    expect(out).toMatch(/Status\s+Enabled/);
    expect(out).toContain(ENDPOINT_URL);
    expect(out).toMatch(/Mode\s+shadow/);
    expect(out).toMatch(/Failure Mode\s+open/);
    expect(out).toMatch(/Timeout\s+5000 ms/);
    expect(out).toMatch(/Rollout\s+100%/);
    expect(out).toMatch(/Headers\s+x-api-key/);
    expect(out).toMatch(/Signing Secret\s+Created 2026-/);
    expect(requests.map(r => `${r.method} ${r.path}`).sort()).toEqual([
      'GET /ai-gateway/inference-hooks',
      'GET /ai-gateway/inference-hooks/signing-secret',
    ]);
    expectTeamScoped(requests);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:inference-hooks', value: 'inference-hooks' },
      { key: 'subcommand:status', value: 'status' },
    ]);
  });

  it('suggests the first steps when nothing is set up', async () => {
    useInferenceHooksApi({
      getConfig: () => ({ body: { configured: false } }),
      getSecret: () => ({ body: { exists: false } }),
    });

    expect(await run('status')).toBe(0);

    expect(stdout()).toMatch(/Status\s+Not configured/);
    expect(stdout()).toMatch(/Signing Secret\s+None/);
    expect(stderr()).toContain(
      'vercel ai-gateway inference-hooks set --endpoint-url <URL>'
    );
    expect(stderr()).toContain(
      'vercel ai-gateway inference-hooks signing-secret create'
    );
  });

  it('prints both reads as one JSON document', async () => {
    useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      getSecret: () => ({ body: secretMetadata }),
    });

    expect(await run('status', '--json')).toBe(0);

    expect(stdoutJson()).toEqual({
      inferenceHooks: savedConfig,
      signingSecret: secretMetadata,
    });
    expect(stderr()).toBe('');
  });

  it('rejects an argument', async () => {
    const requests = useInferenceHooksApi({});
    expect(await run('status', 'extra')).toBe(2);
    expect(stderr()).toContain('takes no arguments');
    expect(requests).toEqual([]);
  });
});
