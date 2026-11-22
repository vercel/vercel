import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dockerEngine } from '../src/engines/docker';
import type { BuildPushParams } from '../src/engines/types';

const { runMock } = vi.hoisted(() => ({
  runMock: vi.fn<typeof import('../src/util').run>(),
}));

vi.mock('../src/util', async importActual => ({
  ...(await importActual<typeof import('../src/util')>()),
  run: runMock,
  info: vi.fn(),
  debug: vi.fn(),
}));

const registryDigest = `sha256:${'a'.repeat(64)}`;
const localDigest = `sha256:${'b'.repeat(64)}`;
const params: BuildPushParams = {
  registry: 'vcr.vercel.com',
  username: 'team_test',
  token: 'registry-token',
  imageRef: 'vcr.vercel.com/acme/my-app/api:build-test',
  repository: 'api',
  contextDir: '/app',
  dockerfilePath: '/app/Dockerfile.vercel',
};

const mediaTypes = [
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
];

describe('Docker push digest', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    runMock.mockReset();
    runMock.mockResolvedValue({ stdout: '', stderr: '' });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(null, {
        headers: { 'Docker-Content-Digest': registryDigest },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    'stdout',
    'stderr',
  ] as const)('uses the final push summary from %s instead of an earlier hash', async stream => {
    runMock.mockResolvedValue({
      stdout: '',
      stderr: '',
      [stream]: `Copying blob ${localDigest}\nbuild-test: digest: ${registryDigest} size: 1234\n`,
    });

    await expect(dockerEngine.push(params)).resolves.toBe(registryDigest);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    '',
    `Copying config ${localDigest}\nWriting manifest\n`,
  ])('resolves the registry digest when the push output has no summary (%j)', async stdout => {
    runMock.mockResolvedValue({ stdout, stderr: '' });

    await expect(dockerEngine.push(params)).resolves.toBe(registryDigest);
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock.mock.calls[0][1]).toEqual(['push', params.imageRef]);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://vcr.vercel.com/v2/acme/my-app/api/manifests/build-test',
      {
        method: 'HEAD',
        headers: {
          authorization: `Basic ${Buffer.from('team_test:registry-token').toString('base64')}`,
          accept: mediaTypes.join(', '),
        },
        redirect: 'manual',
        signal: expect.any(AbortSignal),
      }
    );
  });

  it.each(
    mediaTypes
  )('preserves the registry digest for %s', async mediaType => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        headers: {
          'Content-Type': mediaType,
          'Docker-Content-Digest': registryDigest,
        },
      })
    );

    await expect(dockerEngine.push(params)).resolves.toBe(registryDigest);
  });

  it('supports a configured registry with a port', async () => {
    await expect(
      dockerEngine.push({
        ...params,
        registry: 'registry.example.com:5000',
        imageRef: 'registry.example.com:5000/acme/my-app/api:build-test',
      })
    ).resolves.toBe(registryDigest);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://registry.example.com:5000/v2/acme/my-app/api/manifests/build-test'
    );
  });

  it.each([
    undefined,
    'sha256:abc',
    `${registryDigest}junk`,
  ])('rejects a missing or invalid registry digest (%j)', async digest => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        headers: digest ? { 'Docker-Content-Digest': digest } : {},
      })
    );

    await expect(dockerEngine.push(params)).rejects.toThrow(
      'was pushed, but its registry digest could not be resolved: Registry returned a missing or invalid manifest digest.'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    404, 429, 500, 503,
  ])('retries HTTP %i from the registry', async status => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));

    const assertion = expect(dockerEngine.push(params)).resolves.toBe(
      registryDigest
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    new TypeError('fetch failed'),
    Object.assign(new Error('Timed out'), { name: 'TimeoutError' }),
  ])('retries a failed registry request: %s', async error => {
    fetchMock.mockRejectedValueOnce(error);

    const assertion = expect(dockerEngine.push(params)).resolves.toBe(
      registryDigest
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([307, 400, 401, 403])('does not retry HTTP %i', async status => {
    fetchMock.mockResolvedValue(new Response(null, { status }));

    await expect(dockerEngine.push(params)).rejects.toThrow(
      `was pushed, but its registry digest could not be resolved: Registry returned HTTP ${status}.`
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops after three unsuccessful registry lookups', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));

    const assertion = expect(dockerEngine.push(params)).rejects.toThrow(
      'was pushed, but its registry digest could not be resolved: Registry returned HTTP 503.'
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it('reports the underlying network error when every lookup fails', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), {
        cause: new Error('getaddrinfo ENOTFOUND vcr.vercel.com'),
      })
    );

    const assertion = expect(dockerEngine.push(params)).rejects.toThrow(
      'was pushed, but its registry digest could not be resolved: Registry request failed: fetch failed (getaddrinfo ENOTFOUND vcr.vercel.com)'
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects an image reference outside the push registry without querying it', async () => {
    await expect(
      dockerEngine.push({
        ...params,
        imageRef: 'docker.io/acme/my-app/api:build-test',
      })
    ).rejects.toThrow(
      'was pushed, but its registry digest could not be resolved: Expected a tagged image reference in the push registry.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not query the registry when the push fails', async () => {
    runMock.mockRejectedValue(new Error('push failed'));

    await expect(dockerEngine.push(params)).rejects.toThrow('push failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
