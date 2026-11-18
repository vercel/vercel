import { describe, expect, it } from 'vitest';
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

const OTHER_URL = 'https://staging.security.example.com/hook';

describe('ai-gateway inference-hooks test', () => {
  it('tests the saved endpoint and prints the verdict on stdout', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      postTest: () => ({
        body: { ok: true, action: 'allow', latencyMs: 182 },
      }),
    });

    expect(await run('test', '--header', `x-api-key: ${HEADER_VALUE}`)).toBe(0);

    expect(stdout()).toMatch(/Tested\s+inference hooks endpoint/);
    expect(stdout()).toMatch(/Verdict\s+allow/);
    expect(stdout()).toMatch(/Latency\s+182 ms/);
    expect(requests.find(r => r.method === 'POST')?.body).toEqual({
      endpointUrl: ENDPOINT_URL,
      headers: [{ name: 'x-api-key', value: HEADER_VALUE }],
    });
    expect(stdout()).not.toContain(HEADER_VALUE);
    expect(stderr()).not.toContain(HEADER_VALUE);
    expectTeamScoped(requests);
  });

  it('tests a given URL without reading the saved config', async () => {
    const requests = useInferenceHooksApi({
      postTest: () => ({
        body: {
          ok: true,
          action: 'deny',
          latencyMs: 90,
          denyReason: 'Blocked by policy',
          referenceId: 'ref_123',
        },
      }),
    });

    expect(
      await run('test', '--endpoint-url', OTHER_URL, '--timeout-ms', '2000')
    ).toBe(0);

    expect(requests.map(r => r.method)).toEqual(['POST']);
    expect(requests[0].body).toEqual({
      endpointUrl: OTHER_URL,
      timeoutMs: 2000,
    });
    expect(stdout()).toMatch(/Verdict\s+deny/);
    expect(stdout()).toMatch(/Deny Reason\s+Endpoint: Blocked by policy/);
    expect(stdout()).toMatch(/Reference ID\s+ref_123/);
  });

  it('warns that stored headers are not sent', async () => {
    useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      postTest: () => ({ body: { ok: true, action: 'allow', latencyMs: 1 } }),
    });

    expect(await run('test')).toBe(0);

    expect(stderr()).toContain(
      "A test doesn't send stored headers. Pass the ones the endpoint needs with --header: x-api-key."
    );
  });

  it('exits 1 and prints the failure when the test fails', async () => {
    useInferenceHooksApi({
      postTest: () => ({
        body: { ok: false, failure: 'timeout', latencyMs: 5001 },
      }),
    });

    expect(await run('test', '--endpoint-url', OTHER_URL)).toBe(1);

    expect(stderr()).toContain(
      "The connection test failed. The endpoint didn't answer within the timeout."
    );
    expect(stderr()).toMatch(/Failure\s+timeout/);
    expect(stdout()).toBe('');
  });

  it('keeps the result on stdout with --json when the test fails', async () => {
    const result = {
      ok: false,
      failure: 'status',
      status: 500,
      latencyMs: 40,
    };
    useInferenceHooksApi({ postTest: () => ({ body: result }) });

    expect(await run('test', '--endpoint-url', OTHER_URL, '--json')).toBe(1);

    expect(stdoutJson()).toEqual({ connectionTest: result });
    expect(stderr()).toBe('');
  });

  it('says inference hooks are not available yet for not_enabled', async () => {
    useInferenceHooksApi({
      postTest: () => ({ body: { ok: false, failure: 'not_enabled' } }),
    });

    expect(await run('test', '--endpoint-url', OTHER_URL)).toBe(1);

    expect(stderr()).toContain(
      "Inference hooks aren't available for this team yet."
    );
  });

  it('prints an unknown failure as is', async () => {
    useInferenceHooksApi({
      postTest: () => ({ body: { ok: false, failure: 'brand_new_failure' } }),
    });

    expect(await run('test', '--endpoint-url', OTHER_URL)).toBe(1);

    expect(stderr()).toContain(
      'The connection test failed. The test failed with brand_new_failure.'
    );
  });

  it('says when to retry on a 429 and does not wait', async () => {
    const requests = useInferenceHooksApi({
      postTest: () => ({
        ...apiError(429, 'rate_limited'),
        headers: { 'Retry-After': '30' },
      }),
    });

    expect(await run('test', '--endpoint-url', OTHER_URL, '--json')).toBe(1);

    expect(requests).toHaveLength(1);
    expect(stderrJson()).toMatchObject({
      reason: 'rate_limited',
      message: 'Too many requests to the Vercel API. Try again in 30 seconds.',
      retryAfter: 30,
    });
  });

  it('maps a 503 by its code', async () => {
    useInferenceHooksApi({
      postTest: () => apiError(503, 'rate_limit_unavailable', 'limiter down'),
    });

    expect(await run('test', '--endpoint-url', OTHER_URL)).toBe(1);

    expect(stderr()).toContain(
      "Failed to run the connection test. The connection test's rate limiter is unavailable."
    );
    expect(stderr()).not.toContain('limiter down');
  });

  it('strips control characters from what the endpoint returned', async () => {
    useInferenceHooksApi({
      postTest: () => ({
        body: {
          ok: true,
          action: 'deny',
          latencyMs: 5,
          denyReason: 'Blocked\u001b[31m by\u0007 policy\nnext',
          referenceId: 'ref\u001b]0;x\u0007_1',
        },
      }),
    });

    expect(await run('test', '--endpoint-url', OTHER_URL)).toBe(0);

    expect(stdout()).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f]/);
    expect(stdout()).toContain('Endpoint: Blocked by policy\\nnext');
  });

  it('does not retry a test that failed with a 5xx', async () => {
    const requests = useInferenceHooksApi({
      postTest: () =>
        apiError(502, 'inference_hook_test_unavailable', 'retry later'),
    });

    expect(await run('test', '--endpoint-url', OTHER_URL)).toBe(1);

    expect(requests).toHaveLength(1);
    expect(stderr()).toContain(
      "Failed to run the connection test. AI Gateway couldn't run it."
    );
  });

  it('needs --endpoint-url when no URL is saved', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: { configured: false } }),
    });

    expect(await run('test', '--json')).toBe(2);

    expect(stderrJson().reason).toBe('missing_arguments');
    expect(requests.map(r => r.method)).toEqual(['GET']);
  });

  it('rejects a malformed header without echoing it', async () => {
    const requests = useInferenceHooksApi({});

    expect(await run('test', '--header', HEADER_VALUE)).toBe(2);

    expect(stderr()).toContain('Header 1 must look like "Name: value".');
    expect(stderr()).not.toContain(HEADER_VALUE);
    expect(requests).toEqual([]);
  });

  it('never shows the API message for a request with headers', async () => {
    useInferenceHooksApi({
      postTest: () => apiError(400, 'bad_request', `bad ${HEADER_VALUE}`),
    });

    expect(
      await run(
        'test',
        '--endpoint-url',
        OTHER_URL,
        '--header',
        `x-api-key: ${HEADER_VALUE}`
      )
    ).toBe(2);

    expect(stderr()).not.toContain(HEADER_VALUE);
  });
});
