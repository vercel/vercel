import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import {
  apiError,
  expectTeamScoped,
  run,
  secretMetadata,
  SIGNING_SECRET,
  stderr,
  stderrJson,
  stdout,
  stdoutJson,
  useInferenceHooksApi,
} from './inference-hooks-helpers';

const created = {
  signingSecret: SIGNING_SECRET,
  secretId: secretMetadata.secretId,
  createdAt: secretMetadata.createdAt,
  rotatedAt: null,
  rotated: false,
};

const rotated = {
  ...created,
  secretId: 'c0ffee00-0000-4000-8000-000000000002',
  rotatedAt: 1795000100000,
  rotated: true,
};

/** Telemetry events, serialized, so a test can assert the secret is absent. */
function telemetryText() {
  return JSON.stringify(client.telemetryEventStore.readonlyEvents);
}

// The CI that runs these tests may itself be GitHub Actions.
beforeEach(() => {
  vi.stubEnv('GITHUB_ACTIONS', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ai-gateway inference-hooks signing-secret create', () => {
  it('prints the secret alone on stdout and the receipt on stderr', async () => {
    const requests = useInferenceHooksApi({
      postSecret: () => ({ status: 201, body: created }),
    });

    expect(await run('signing-secret', 'create')).toBe(0);

    expect(stdout()).toBe(`${SIGNING_SECRET}\n`);
    expect(stderr()).not.toContain(SIGNING_SECRET);
    expect(stderr()).toMatch(/Created\s+signing secret/);
    expect(stderr()).toContain(secretMetadata.secretId);
    expect(telemetryText()).not.toContain(SIGNING_SECRET);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'POST',
      path: '/ai-gateway/inference-hooks/signing-secret',
      body: { expectedSecretId: null },
    });
    expectTeamScoped(requests);
  });

  it('puts the secret inside the one JSON document', async () => {
    useInferenceHooksApi({
      postSecret: () => ({ status: 201, body: created }),
    });

    expect(await run('signing-secret', 'create', '--json')).toBe(0);

    expect(stdoutJson()).toMatchObject({
      signingSecret: {
        secretId: secretMetadata.secretId,
        createdAt: secretMetadata.createdAt,
        rotatedAt: null,
        value: SIGNING_SECRET,
      },
      outcome: 'created',
    });
    expect(stderr()).toBe('');
  });

  it('masks the secret in GitHub Actions before printing it', async () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    useInferenceHooksApi({
      postSecret: () => ({ status: 201, body: created }),
    });

    expect(await run('signing-secret', 'create', '--json')).toBe(0);

    expect(stderr()).toBe(`::add-mask::${SIGNING_SECRET}\n`);
  });

  it('names rotate when a secret already exists', async () => {
    useInferenceHooksApi({
      postSecret: () => apiError(409, 'signing_secret_conflict'),
    });

    expect(await run('signing-secret', 'create')).toBe(1);

    expect(stderr()).toContain(
      "Can't create a signing secret. This team already has one."
    );
    expect(stderr()).toContain(
      'vercel ai-gateway inference-hooks signing-secret rotate'
    );
    expect(stdout()).toBe('');
  });

  it('does not retry a create that failed with a 5xx', async () => {
    const requests = useInferenceHooksApi({
      postSecret: () => ({ status: 500, body: { error: { message: 'x' } } }),
    });

    expect(await run('signing-secret', 'create', '--json')).toBe(1);

    expect(requests).toHaveLength(1);
    expect(stderrJson()).toMatchObject({
      reason: 'unknown_outcome',
      message:
        "Can't confirm whether the signing secret was created. The Vercel API returned a server error.",
    });
  });
});

describe('ai-gateway inference-hooks signing-secret rotate', () => {
  it('rotates the current secret after confirming', async () => {
    const requests = useInferenceHooksApi({
      getSecret: () => ({ body: secretMetadata }),
      postSecret: () => ({ body: rotated }),
    });

    const exitCode = run('signing-secret', 'rotate');
    await expect(client.stderr).toOutput('Rotate the signing secret?');
    client.stdin.write('y\n');

    expect(await exitCode).toBe(0);
    expect(stdout()).toBe(`${SIGNING_SECRET}\n`);
    expect(stderr()).not.toContain(SIGNING_SECRET);
    expect(stderr()).toContain('The current one stops working at once');
    expect(stderr()).toMatch(/Rotated\s+signing secret/);
    expect(requests.find(r => r.method === 'POST')?.body).toEqual({
      expectedSecretId: secretMetadata.secretId,
    });
    expect(telemetryText()).not.toContain(SIGNING_SECRET);
  });

  it('needs --yes in a non-interactive run', async () => {
    client.nonInteractive = true;
    const requests = useInferenceHooksApi({
      getSecret: () => ({ body: secretMetadata }),
    });

    expect(await run('signing-secret', 'rotate')).toBe(2);

    expect(stderr()).toContain(
      "Can't rotate the signing secret without confirmation in non-interactive mode."
    );
    expect(requests.some(r => r.method === 'POST')).toBe(false);
  });

  it('needs --yes without a terminal', async () => {
    client.stdin.isTTY = false;
    const requests = useInferenceHooksApi({
      getSecret: () => ({ body: secretMetadata }),
    });

    expect(await run('signing-secret', 'rotate', '--json')).toBe(2);

    expect(stderrJson()).toMatchObject({
      reason: 'confirmation_required',
      data: { effects: [`Rotate signing secret ${secretMetadata.secretId}`] },
    });
    expect(requests.some(r => r.method === 'POST')).toBe(false);
  });

  it('rotates with --yes and returns the secret in JSON', async () => {
    useInferenceHooksApi({
      getSecret: () => ({ body: secretMetadata }),
      postSecret: () => ({ body: rotated }),
    });

    expect(await run('signing-secret', 'rotate', '--yes', '--json')).toBe(0);

    expect(stdoutJson()).toMatchObject({
      signingSecret: { secretId: rotated.secretId, value: SIGNING_SECRET },
      outcome: 'rotated',
    });
  });

  it('says the secret changed meanwhile on a 409', async () => {
    useInferenceHooksApi({
      getSecret: () => ({ body: secretMetadata }),
      postSecret: () => apiError(409, 'signing_secret_conflict'),
    });

    expect(await run('signing-secret', 'rotate', '--yes', '--json')).toBe(1);

    expect(stderrJson()).toMatchObject({
      reason: 'conflict',
      message: "Can't rotate the signing secret. It changed after it was read.",
    });
  });

  it('fails when there is no secret to rotate', async () => {
    const requests = useInferenceHooksApi({
      getSecret: () => ({ body: { exists: false } }),
    });

    expect(await run('signing-secret', 'rotate', '--yes')).toBe(1);

    expect(stderr()).toContain(
      'vercel ai-gateway inference-hooks signing-secret create'
    );
    expect(requests.some(r => r.method === 'POST')).toBe(false);
  });

  it('does not retry a rotate that failed with a 5xx', async () => {
    const requests = useInferenceHooksApi({
      getSecret: () => ({ body: secretMetadata }),
      postSecret: () => ({ status: 502, body: { error: { message: 'x' } } }),
    });

    expect(await run('signing-secret', 'rotate', '--yes')).toBe(1);

    expect(requests.filter(r => r.method === 'POST')).toHaveLength(1);
    expect(stderr()).toContain(
      "Can't confirm whether the signing secret was rotated."
    );
  });
});
