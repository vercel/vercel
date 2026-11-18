import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import {
  apiError,
  ENDPOINT_URL,
  expectTeamScoped,
  HEADER_VALUE,
  run,
  savedConfig,
  stderr,
  stderrJson,
  stdout,
  stdoutJson,
  useInferenceHooksApi,
} from './inference-hooks-helpers';

const NEW_URL = 'https://security.example.com/v2/hook';

function echoPut(body: any) {
  const { headers, ...entry } = body;
  return {
    body: {
      ...savedConfig,
      ...entry,
      headers: headers
        ? { names: headers.map((h: any) => h.name), updatedAt: 1 }
        : savedConfig.headers,
    },
  };
}

describe('ai-gateway inference-hooks set', () => {
  it('changes only the given option, sending the rest back unchanged', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: { ...savedConfig, enabled: true } }),
      putConfig: echoPut,
    });

    expect(await run('set', '--mode', 'enforce')).toBe(0);

    const put = requests.find(r => r.method === 'PUT');
    expect(put?.body).toEqual({
      endpointUrl: ENDPOINT_URL,
      enabled: true,
      mode: 'enforce',
      failureMode: 'open',
      timeoutMs: 5000,
      rolloutPercent: 100,
    });
    expect(put?.body).not.toHaveProperty('headers');
    expectTeamScoped(requests);
    expect(stderr()).toMatch(/Set\s+inference hooks/);
    expect(stderr()).toMatch(/Mode\s+enforce/);
    expect(stdout()).toBe('');
  });

  it('creates a disabled config on first set, leaving defaults to the API', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: { configured: false } }),
      putConfig: echoPut,
    });

    expect(
      await run('set', '--endpoint-url', ENDPOINT_URL, '--timeout-ms', '3000')
    ).toBe(0);

    expect(requests.find(r => r.method === 'PUT')?.body).toEqual({
      endpointUrl: ENDPOINT_URL,
      enabled: false,
      timeoutMs: 3000,
    });
    expect(stderr()).toContain('vercel ai-gateway inference-hooks enable');
  });

  it('needs --endpoint-url for a first set', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: { configured: false } }),
    });

    expect(await run('set', '--mode', 'enforce', '--json')).toBe(2);

    expect(stderrJson()).toMatchObject({
      status: 'error',
      reason: 'missing_arguments',
    });
    expect(requests.map(r => r.method)).toEqual(['GET']);
  });

  it('rejects --header with --clear-headers before any request', async () => {
    const requests = useInferenceHooksApi({});

    expect(
      await run(
        'set',
        '--header',
        `x-api-key: ${HEADER_VALUE}`,
        '--clear-headers'
      )
    ).toBe(2);

    expect(stderr()).toContain("Can't use --header with --clear-headers.");
    expect(stderr()).not.toContain(HEADER_VALUE);
    expect(requests).toEqual([]);
  });

  it('reports every invalid option at once', async () => {
    const requests = useInferenceHooksApi({});

    expect(
      await run(
        'set',
        '--mode',
        'block',
        '--timeout-ms',
        '0',
        '--rollout-percent',
        '101',
        '--endpoint-url',
        'http://security.example.com/hook',
        '--header',
        HEADER_VALUE,
        '--json'
      )
    ).toBe(2);

    const error = stderrJson();
    expect(error.reason).toBe('invalid_arguments');
    expect(error.data.issues.map((i: any) => i.field).sort()).toEqual([
      'endpoint-url',
      'header',
      'mode',
      'rollout-percent',
      'timeout-ms',
    ]);
    expect(stderr()).not.toContain(HEADER_VALUE);
    expect(requests).toEqual([]);
  });

  it('sends --header as the new set and never prints its value', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      putConfig: echoPut,
    });

    expect(
      await run(
        'set',
        '--header',
        `x-api-key: ${HEADER_VALUE}`,
        '--header',
        'x-tenant:acme:eu',
        '--json'
      )
    ).toBe(0);

    expect(requests.find(r => r.method === 'PUT')?.body).toMatchObject({
      headers: [
        { name: 'x-api-key', value: HEADER_VALUE },
        { name: 'x-tenant', value: 'acme:eu' },
      ],
    });
    expect(stdoutJson()).toMatchObject({
      inferenceHooks: { headers: { names: ['x-api-key', 'x-tenant'] } },
      outcome: 'set',
    });
    expect(stdout()).not.toContain(HEADER_VALUE);
    expect(stderr()).not.toContain(HEADER_VALUE);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:inference-hooks', value: 'inference-hooks' },
      { key: 'subcommand:set', value: 'set' },
      { key: 'option:header', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('clears the headers with --clear-headers', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      putConfig: echoPut,
    });

    expect(await run('set', '--clear-headers')).toBe(0);

    expect(requests.find(r => r.method === 'PUT')?.body).toMatchObject({
      headers: [],
    });
  });

  it('warns that a new URL clears the stored headers', async () => {
    useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      putConfig: body => ({
        body: {
          ...echoPut(body).body,
          headers: { names: [], updatedAt: null },
        },
      }),
    });

    expect(await run('set', '--endpoint-url', NEW_URL, '--yes')).toBe(0);

    expect(stderr()).toContain(
      'The endpoint URL changed, so the stored headers were cleared: x-api-key. Pass them again with --header.'
    );
  });

  describe('a URL change that deletes stored headers', () => {
    function useUrlChange() {
      return useInferenceHooksApi({
        getConfig: () => ({ body: savedConfig }),
        putConfig: echoPut,
      });
    }

    it('previews the deletion and saves after confirming', async () => {
      const requests = useUrlChange();

      const exitCode = run('set', '--endpoint-url', NEW_URL);
      await expect(client.stderr).toOutput(
        'Change the endpoint URL and delete 1 stored header?'
      );
      client.stdin.write('y\n');

      expect(await exitCode).toBe(0);
      expect(stderr()).toMatch(/Headers\s+x-api-key/);
      expect(stderr()).toContain('Some effects cannot be undone.');
      expect(requests.filter(r => r.method === 'PUT')).toHaveLength(1);
    });

    it('changes nothing when the prompt is declined', async () => {
      const requests = useUrlChange();

      const exitCode = run('set', '--endpoint-url', NEW_URL);
      await expect(client.stderr).toOutput(
        'Change the endpoint URL and delete 1 stored header?'
      );
      client.stdin.write('n\n');

      expect(await exitCode).toBe(130);
      expect(stderr()).toContain('Canceled. Nothing was changed.');
      expect(requests.some(r => r.method === 'PUT')).toBe(false);
    });

    it('needs --yes without a terminal, and suggests --header', async () => {
      client.stdin.isTTY = false;
      const requests = useUrlChange();

      expect(await run('set', '--endpoint-url', NEW_URL, '--json')).toBe(2);

      const error = stderrJson();
      expect(error).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        userActionRequired: true,
        data: {
          effects: [
            'Change the endpoint URL',
            'Delete 1 stored header: x-api-key',
          ],
        },
      });
      expect(error.next.map((step: any) => step.command)).toEqual([
        'vercel ai-gateway inference-hooks set --endpoint-url <URL> --header <KEY:VALUE>',
        'vercel ai-gateway inference-hooks set --endpoint-url <URL> --yes',
      ]);
      expect(stderr()).not.toContain(NEW_URL);
      expect(requests.some(r => r.method === 'PUT')).toBe(false);
    });

    it('saves with --yes', async () => {
      const requests = useUrlChange();

      expect(await run('set', '--endpoint-url', NEW_URL, '--yes')).toBe(0);

      expect(requests.find(r => r.method === 'PUT')?.body).toMatchObject({
        endpointUrl: NEW_URL,
      });
      expect(requests.find(r => r.method === 'PUT')?.body).not.toHaveProperty(
        'headers'
      );
    });

    it('needs no confirmation with --header', async () => {
      const requests = useUrlChange();

      expect(
        await run(
          'set',
          '--endpoint-url',
          NEW_URL,
          '--header',
          `x-api-key: ${HEADER_VALUE}`
        )
      ).toBe(0);

      expect(requests.filter(r => r.method === 'PUT')).toHaveLength(1);
      expect(stderr()).not.toContain('Change the endpoint URL');
    });

    it('needs no confirmation with --clear-headers', async () => {
      const requests = useUrlChange();

      expect(
        await run('set', '--endpoint-url', NEW_URL, '--clear-headers')
      ).toBe(0);

      expect(requests.find(r => r.method === 'PUT')?.body).toMatchObject({
        headers: [],
      });
    });
  });

  it('puts the cleared-headers warning in the JSON document', async () => {
    useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      putConfig: echoPut,
    });

    expect(await run('set', '--endpoint-url', NEW_URL, '--yes', '--json')).toBe(
      0
    );

    expect(stdoutJson().warnings).toEqual([
      expect.objectContaining({ reason: 'headers_cleared' }),
    ]);
    expect(stderr()).toBe('');
  });

  it('records known mode values and redacts the rest', async () => {
    useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      putConfig: echoPut,
    });

    expect(
      await run(
        'set',
        '--endpoint-url',
        NEW_URL,
        '--mode',
        'enforce',
        '--failure-mode',
        'closed',
        '--timeout-ms',
        '2000',
        '--rollout-percent',
        '50',
        '--yes'
      )
    ).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:inference-hooks', value: 'inference-hooks' },
      { key: 'subcommand:set', value: 'set' },
      { key: 'option:endpoint-url', value: '[REDACTED]' },
      { key: 'option:mode', value: 'enforce' },
      { key: 'option:failure-mode', value: 'closed' },
      { key: 'option:timeout-ms', value: '[REDACTED]' },
      { key: 'option:rollout-percent', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });

  it('does not retry a write that failed with a 5xx', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      putConfig: () => ({ status: 500, body: { error: { message: 'boom' } } }),
    });

    expect(await run('set', '--mode', 'enforce', '--json')).toBe(1);

    expect(requests.filter(r => r.method === 'PUT')).toHaveLength(1);
    expect(stderrJson()).toMatchObject({
      reason: 'unknown_outcome',
      retryable: false,
      data: { remote: 'unknown' },
    });
  });

  describe('API errors', () => {
    it('maps a rejected endpoint URL', async () => {
      useInferenceHooksApi({
        getConfig: () => ({ body: savedConfig }),
        putConfig: () =>
          apiError(400, 'invalid_inference_hooks_endpoint_url', 'bad url'),
      });

      expect(await run('set', '--endpoint-url', NEW_URL, '--yes')).toBe(2);

      expect(stderr()).toContain(
        "Can't save the inference hooks configuration. AI Gateway doesn't accept this endpoint URL."
      );
      expect(stderr()).toContain('Vercel API: bad url');
    });

    it('maps rejected headers without showing the API message', async () => {
      useInferenceHooksApi({
        getConfig: () => ({ body: savedConfig }),
        putConfig: () =>
          apiError(
            400,
            'invalid_inference_hooks_headers',
            `header ${HEADER_VALUE} rejected`
          ),
      });

      expect(
        await run('set', '--header', `x-api-key: ${HEADER_VALUE}`, '--json')
      ).toBe(2);

      const error = stderrJson();
      expect(error).toMatchObject({ reason: 'invalid_arguments' });
      expect(error.data?.remoteMessage).toBeUndefined();
      expect(stderr()).not.toContain(HEADER_VALUE);
    });

    it('hides the API message for a schema error on a request with headers', async () => {
      useInferenceHooksApi({
        getConfig: () => ({ body: savedConfig }),
        putConfig: () => apiError(400, 'bad_request', `echo ${HEADER_VALUE}`),
      });

      expect(await run('set', '--header', `x-api-key: ${HEADER_VALUE}`)).toBe(
        2
      );

      expect(stderr()).toContain(
        "Can't save the inference hooks configuration. The API rejected the request."
      );
      expect(stderr()).not.toContain(HEADER_VALUE);
    });

    it('names the AI Gateway Settings permission on a 403', async () => {
      useInferenceHooksApi({
        getConfig: () => ({ body: savedConfig }),
        putConfig: () => apiError(403, 'forbidden', 'Not allowed'),
      });

      expect(await run('set', '--mode', 'enforce', '--json')).toBe(1);

      expect(stderrJson()).toMatchObject({
        reason: 'permission_denied',
        message:
          "You can't save the inference hooks configuration. It needs the AI Gateway Settings permission.",
        data: { remoteMessage: 'Not allowed' },
      });
    });

    it('maps the API refusing to keep hooks on without a secret', async () => {
      useInferenceHooksApi({
        getConfig: () => ({ body: { ...savedConfig, enabled: true } }),
        putConfig: () =>
          apiError(409, 'inference_hooks_signing_secret_required', 'no secret'),
      });

      expect(await run('set', '--mode', 'enforce', '--json')).toBe(1);

      expect(stderrJson()).toMatchObject({
        reason: 'signing_secret_required',
        message:
          "Can't save the inference hooks configuration. This team needs a signing secret first.",
        next: [
          {
            command: 'vercel ai-gateway inference-hooks signing-secret create',
          },
        ],
      });
    });

    it('says AI Gateway is not set up for a missing customer record', async () => {
      useInferenceHooksApi({
        getConfig: () => ({ body: { configured: false } }),
        putConfig: () => apiError(404, 'customer_info_not_found'),
      });

      expect(await run('set', '--endpoint-url', ENDPOINT_URL)).toBe(1);

      expect(stderr()).toContain(
        "Can't save the inference hooks configuration. AI Gateway isn't set up for this team yet."
      );
    });
  });
});
