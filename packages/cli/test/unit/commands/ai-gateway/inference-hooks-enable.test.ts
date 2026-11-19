import { describe, expect, it } from 'vitest';
import {
  apiError,
  ENDPOINT_URL,
  expectTeamScoped,
  run,
  savedConfig,
  secretMetadata,
  stderr,
  stderrJson,
  stdout,
  stdoutJson,
  useInferenceHooksApi,
} from './inference-hooks-helpers';

describe('ai-gateway inference-hooks enable', () => {
  it('saves the config with enabled turned on and keeps the headers', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      getSecret: () => ({ body: secretMetadata }),
      putConfig: body => ({ body: { ...savedConfig, ...body } }),
    });

    expect(await run('enable')).toBe(0);

    const put = requests.find(r => r.method === 'PUT');
    expect(put?.body).toEqual({
      endpointUrl: ENDPOINT_URL,
      enabled: true,
      mode: 'shadow',
      failureMode: 'open',
      timeoutMs: 5000,
      rolloutPercent: 100,
    });
    expectTeamScoped(requests);
    expect(stderr()).toMatch(/Enabled\s+inference hooks/);
    expect(stderr()).not.toContain('needs a signing secret');
  });

  it('is a no-op when already enabled', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: { ...savedConfig, enabled: true } }),
    });

    expect(await run('enable', '--json')).toBe(0);

    expect(stdoutJson().outcome).toBe('unchanged');
    expect(requests.map(r => `${r.method} ${r.path}`)).toEqual([
      'GET /ai-gateway/inference-hooks',
    ]);
  });

  it('fails before the write when there is no signing secret', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      getSecret: () => ({ body: { exists: false } }),
      putConfig: body => ({ body: { ...savedConfig, ...body } }),
    });

    expect(await run('enable')).toBe(1);

    expect(stderr()).toContain(
      "Can't enable inference hooks. This team needs a signing secret first."
    );
    expect(stderr()).toContain(
      'vercel ai-gateway inference-hooks signing-secret create'
    );
    expect(stderr()).not.toContain('Enabled');
    expect(requests.some(r => r.method === 'PUT')).toBe(false);
  });

  it('fails with signing_secret_required in JSON when there is no secret', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      getSecret: () => ({ body: { exists: false } }),
    });

    expect(await run('enable', '--json')).toBe(1);

    expect(stdout()).toBe('');
    expect(stderrJson()).toMatchObject({
      status: 'error',
      reason: 'signing_secret_required',
      message:
        "Can't enable inference hooks. This team needs a signing secret first.",
      next: [
        {
          command: 'vercel ai-gateway inference-hooks signing-secret create',
        },
      ],
    });
    expect(requests.some(r => r.method === 'PUT')).toBe(false);
  });

  it('maps the API refusing to enable without a secret', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      getSecret: () => ({ body: secretMetadata }),
      putConfig: () =>
        apiError(409, 'inference_hooks_signing_secret_required', 'no secret'),
    });

    expect(await run('enable')).toBe(1);

    expect(stderr()).toContain(
      "Can't enable inference hooks. This team needs a signing secret first."
    );
    expect(stderr()).toContain(
      'vercel ai-gateway inference-hooks signing-secret create'
    );
    expect(requests.filter(r => r.method === 'PUT')).toHaveLength(1);
  });

  it('maps the API refusal in JSON', async () => {
    useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      getSecret: () => ({ body: secretMetadata }),
      putConfig: () =>
        apiError(409, 'inference_hooks_signing_secret_required', 'no secret'),
    });

    expect(await run('enable', '--json')).toBe(1);

    expect(stdout()).toBe('');
    expect(stderrJson()).toMatchObject({
      reason: 'signing_secret_required',
      next: [
        {
          command: 'vercel ai-gateway inference-hooks signing-secret create',
        },
      ],
    });
  });

  it('fails when nothing is set up', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: { configured: false } }),
      getSecret: () => ({ body: { exists: false } }),
    });

    expect(await run('enable', '--json')).toBe(1);

    expect(stderrJson()).toMatchObject({
      reason: 'not_found',
      message: "Can't enable inference hooks. None are set up for this team.",
    });
    expect(requests.some(r => r.method === 'PUT')).toBe(false);
  });

  it('does not retry a write that failed with a 5xx', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      getSecret: () => ({ body: secretMetadata }),
      putConfig: () => ({ status: 503, body: { error: { message: 'down' } } }),
    });

    expect(await run('enable')).toBe(1);

    expect(requests.filter(r => r.method === 'PUT')).toHaveLength(1);
    expect(stderr()).toContain(
      "Can't confirm whether inference hooks were enabled."
    );
    expect(stderr()).toContain('vercel ai-gateway inference-hooks status');
  });
});

describe('ai-gateway inference-hooks enable, API errors', () => {
  it('exits 1 when the API rejects the saved configuration', async () => {
    useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      getSecret: () => ({ body: secretMetadata }),
      putConfig: () => apiError(400, 'bad_request', 'invalid entry'),
    });

    expect(await run('enable', '--json')).toBe(1);

    expect(stderrJson()).toMatchObject({
      reason: 'api_error',
      message:
        'Failed to enable inference hooks. The API rejected the saved configuration.',
    });
  });

  it('stops after the first read fails', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => apiError(403, 'forbidden'),
      getSecret: () => ({ body: secretMetadata }),
    });

    expect(await run('enable', '--json')).toBe(1);

    expect(requests.map(r => r.path)).toEqual(['/ai-gateway/inference-hooks']);
  });
});

describe('ai-gateway inference-hooks disable', () => {
  it('saves the config with enabled turned off', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: { ...savedConfig, enabled: true } }),
      putConfig: body => ({ body: { ...savedConfig, ...body } }),
    });

    expect(await run('disable', '--json')).toBe(0);

    expect(requests.find(r => r.method === 'PUT')?.body).toMatchObject({
      enabled: false,
    });
    expect(requests.some(r => r.path.endsWith('/signing-secret'))).toBe(false);
    expect(stdoutJson()).toMatchObject({
      inferenceHooks: { enabled: false },
      outcome: 'disabled',
    });
  });

  it('is a no-op when already disabled', async () => {
    useInferenceHooksApi({ getConfig: () => ({ body: savedConfig }) });

    expect(await run('disable')).toBe(0);

    expect(stderr()).toContain('Inference hooks are already disabled.');
  });
});
