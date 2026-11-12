import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Org, Project } from '@vercel-internals/types';

vi.mock('../../../../src/util/fetch', () => ({ default: vi.fn() }));
vi.mock('../../../../src/util/projects/get-project-by-id-or-name', () => ({
  default: vi.fn(),
}));
vi.mock('../../../../src/commands/curl/bypass-token', () => ({
  getOrCreateDeploymentProtectionToken: vi.fn(),
}));

import fetch from '../../../../src/util/fetch';
import getProjectByIdOrName from '../../../../src/util/projects/get-project-by-id-or-name';
import { getOrCreateDeploymentProtectionToken } from '../../../../src/commands/curl/bypass-token';
import {
  formatVerificationFailure,
  formatVerificationSummary,
  verifyDeployment,
} from '../../../../src/util/deploy/verify-deployment';

const client = {} as any;
const url = 'https://report.vercel.app';
const project = { id: 'prj_1', accountId: 'team_1' };
const org: Org = { type: 'team', id: 'team_1', slug: 'acme' };

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function redirect(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
}

/** The URL and bypass header of every request, in order. */
function requests() {
  return vi.mocked(fetch).mock.calls.map(([input, init]) => ({
    url: String(input),
    bypass:
      (init?.headers as Record<string, string>)['x-vercel-protection-bypass'] ??
      null,
  }));
}

function useBypassSecret() {
  vi.mocked(getProjectByIdOrName).mockResolvedValue({
    id: 'prj_1',
  } as Project);
  vi.mocked(getOrCreateDeploymentProtectionToken).mockResolvedValue(
    'bypass-secret'
  );
}

describe('verifyDeployment()', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    vi.mocked(getProjectByIdOrName).mockReset();
    vi.mocked(getOrCreateDeploymentProtectionToken).mockReset();
  });

  it('reports the status code, size, and page title', async () => {
    const body =
      '<html><head><title> Q3 &amp; Q4 report </title></head></html>';
    vi.mocked(fetch).mockResolvedValue(html(body) as any);

    const result = await verifyDeployment(client, url, {
      project,
      org,
      protectionEnabled: false,
    });

    expect(result).toEqual({
      url,
      ok: true,
      statusCode: 200,
      size: Buffer.byteLength(body),
      title: 'Q3 & Q4 report',
      error: null,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toEqual({});
  });

  it('has no title for a page that is not HTML', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('<title>not html</title>', {
        headers: { 'content-type': 'text/plain' },
      }) as any
    );

    const result = await verifyDeployment(client, url, {
      protectionEnabled: false,
    });

    expect(result.title).toBeNull();
    expect(result.ok).toBe(true);
  });

  it('replaces control characters in the title', async () => {
    vi.mocked(fetch).mockResolvedValue(
      html('<title>a\u001b[31mred\u001b[39m\tline\u0007</title>') as any
    );

    const result = await verifyDeployment(client, url, {
      protectionEnabled: false,
    });

    expect(result.title).toBe('ared line');
  });

  it('retries a protected 401 with the project bypass secret', async () => {
    const freshProject = { id: 'prj_1', name: 'report' } as Project;
    vi.mocked(fetch)
      .mockResolvedValueOnce(html('login', 401) as any)
      .mockResolvedValueOnce(html('<title>Report</title>') as any);
    vi.mocked(getProjectByIdOrName).mockResolvedValue(freshProject);
    vi.mocked(getOrCreateDeploymentProtectionToken).mockResolvedValue(
      'bypass-secret'
    );

    const result = await verifyDeployment(client, url, {
      project,
      org,
      protectionEnabled: true,
    });

    expect(getProjectByIdOrName).toHaveBeenCalledWith(
      client,
      'prj_1',
      'team_1'
    );
    expect(getOrCreateDeploymentProtectionToken).toHaveBeenCalledWith(client, {
      status: 'linked',
      project: freshProject,
      org,
    });
    expect(vi.mocked(fetch).mock.calls[1][1]?.headers).toEqual({
      'x-vercel-protection-bypass': 'bypass-secret',
    });
    expect(result).toMatchObject({
      ok: true,
      statusCode: 200,
      title: 'Report',
    });
  });

  it('never sends the bypass secret to another origin a redirect points at', async () => {
    useBypassSecret();
    vi.mocked(fetch)
      .mockResolvedValueOnce(html('login', 401) as any)
      .mockResolvedValueOnce(redirect('https://attacker.example/steal') as any)
      .mockResolvedValueOnce(html('<title>Elsewhere</title>') as any);

    const result = await verifyDeployment(client, url, {
      project,
      org,
      protectionEnabled: true,
    });

    expect(requests()).toEqual([
      { url, bypass: null },
      { url, bypass: 'bypass-secret' },
      { url: 'https://attacker.example/steal', bypass: null },
    ]);
    expect(result).toMatchObject({ ok: true, statusCode: 200 });
  });

  it('drops the bypass secret when a redirect moves to http on the same host', async () => {
    useBypassSecret();
    vi.mocked(fetch)
      .mockResolvedValueOnce(html('login', 401) as any)
      .mockResolvedValueOnce(redirect('http://report.vercel.app/') as any)
      .mockResolvedValueOnce(html('plain') as any);

    await verifyDeployment(client, url, {
      project,
      org,
      protectionEnabled: true,
    });

    expect(requests()[2]).toEqual({
      url: 'http://report.vercel.app/',
      bypass: null,
    });
  });

  it('keeps the bypass secret for a redirect within the deployment', async () => {
    useBypassSecret();
    vi.mocked(fetch)
      .mockResolvedValueOnce(html('login', 401) as any)
      .mockResolvedValueOnce(redirect('/index.html', 308) as any)
      .mockResolvedValueOnce(html('<title>Report</title>') as any);

    const result = await verifyDeployment(client, url, {
      project,
      org,
      protectionEnabled: true,
    });

    expect(requests()[2]).toEqual({
      url: 'https://report.vercel.app/index.html',
      bypass: 'bypass-secret',
    });
    expect(result).toMatchObject({ ok: true, title: 'Report' });
  });

  it('gives up after 5 redirects', async () => {
    vi.mocked(fetch).mockImplementation(async () => redirect('/loop') as any);

    const result = await verifyDeployment(client, url, {
      protectionEnabled: false,
    });

    expect(fetch).toHaveBeenCalledTimes(6);
    expect(result).toMatchObject({
      ok: false,
      statusCode: null,
      error: 'Too many redirects (more than 5)',
    });
  });

  it("leaves an app's own 401 alone when protection is off", async () => {
    vi.mocked(fetch).mockResolvedValue(html('nope', 401) as any);

    const result = await verifyDeployment(client, url, {
      project,
      org,
      protectionEnabled: false,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getOrCreateDeploymentProtectionToken).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, statusCode: 401 });
  });

  it('reports the 401 when no bypass secret can be made', async () => {
    vi.mocked(fetch).mockResolvedValue(html('login', 401) as any);
    vi.mocked(getProjectByIdOrName).mockResolvedValue({
      id: 'prj_1',
    } as Project);
    vi.mocked(getOrCreateDeploymentProtectionToken).mockRejectedValue(
      new Error('Failed to create deployment protection bypass token')
    );

    const result = await verifyDeployment(client, url, {
      project,
      org,
      protectionEnabled: true,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false, statusCode: 401 });
  });

  it('turns a failed request into a result instead of throwing', async () => {
    vi.mocked(fetch).mockRejectedValue(
      new TypeError('fetch failed', {
        cause: new Error('getaddrinfo ENOTFOUND report.vercel.app'),
      })
    );

    const result = await verifyDeployment(client, url, {
      protectionEnabled: false,
    });

    expect(result).toEqual({
      url,
      ok: false,
      statusCode: null,
      size: null,
      title: null,
      error: 'fetch failed: getaddrinfo ENOTFOUND report.vercel.app',
    });
  });
});

describe('verification messages', () => {
  const result = {
    url,
    ok: true,
    statusCode: 200,
    size: 46,
    title: null,
    error: null,
  };

  it('leaves out a missing title', () => {
    expect(formatVerificationSummary(result)).toBe('200, 46 B');
  });

  it('names the status code or the request error', () => {
    expect(
      formatVerificationFailure({ ...result, ok: false, statusCode: 404 })
    ).toBe('https://report.vercel.app returned 404.');
    expect(
      formatVerificationFailure({
        ...result,
        ok: false,
        statusCode: null,
        error: 'The operation was aborted due to timeout',
      })
    ).toBe(
      "Couldn't load https://report.vercel.app: The operation was aborted due to timeout"
    );
  });
});
