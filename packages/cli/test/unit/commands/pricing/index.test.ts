import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import pricing, { PRICING_URL } from '../../../../src/commands/pricing';
import { isAllowedPricingUrl } from '../../../../src/commands/pricing/allowed-url';
import ua from '../../../../src/util/ua';
import { SUBCOMMANDS_WITHOUT_TOKEN } from '../../../../src/util/subcommands-without-token';
import { MAX_PRICING_BYTES } from '../../../../src/commands/pricing/read-bounded-text';
import { PRICING_FIXTURE } from './fixture';

function isPricingUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === 'vercel.com' ||
        parsed.hostname === 'www.vercel.com') &&
      parsed.pathname === '/pricing.md'
    );
  } catch {
    return false;
  }
}

function markdownResponse(body: string = PRICING_FIXTURE, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
}

function mockPricing(body: string = PRICING_FIXTURE, status = 200) {
  const originalFetch = globalThis.fetch.bind(globalThis);
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (isPricingUrl(url)) {
      return Promise.resolve(markdownResponse(body, status));
    }
    return originalFetch(input, init);
  });
}

describe('pricing', () => {
  beforeEach(() => {
    client.reset();
    client.cwd = setupTmpDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows command help', async () => {
    client.setArgv('pricing', '--help');

    expect(await pricing(client)).toBe(0);
    expect(client.getFullOutput()).toContain(
      'Show Hobby, Pro, and Enterprise features from the public Vercel pricing'
    );
    expect(client.getFullOutput()).toContain('vercel pricing firewall --json');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'pricing' },
    ]);
  });

  it('shows the current team plan and groups features by lowest plan', async () => {
    useUser();
    useTeams('team_123', { billingPlan: 'pro' });
    client.config.currentTeam = 'team_123';
    const fetchMock = mockPricing();
    client.setArgv('pricing');

    expect(await pricing(client)).toBe(0);

    const pricingCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes(PRICING_URL)
    );
    expect(pricingCall).toBeDefined();
    const [, init] = pricingCall!;
    const headers = new Headers(init?.headers);
    expect(headers.get('user-agent')).toBe(ua);
    expect(headers.has('authorization')).toBe(false);
    expect(init?.redirect).toBe('manual');

    const output = client.getFullOutput();
    expect(output).toContain('Current team:');
    expect(output).toContain('Current plan: Pro');
    expect(output).toContain(PRICING_URL);
    expect(output).toContain('  HOBBY  ');
    expect(output).toContain('available on Hobby, Pro, and Enterprise');
    expect(output).toContain('  PRO  ');
    expect(output).toContain('available on Pro and Enterprise');
    expect(output).toContain('  ENTERPRISE  ');
    expect(output).toContain('available on Enterprise');
    expect(output).toContain('Skew Protection');
    expect(output).toContain('Audit Logs');
    expect(output).toContain('[not on current plan]');
  });

  it('answers a feature query for the current plan', async () => {
    useUser();
    useTeams('team_123', { billingPlan: 'hobby' });
    client.config.currentTeam = 'team_123';
    mockPricing();
    client.setArgv('pricing', 'skew', 'protection');

    expect(await pricing(client)).toBe(0);

    const output = client.getFullOutput();
    expect(output).toContain('Current plan: Hobby');
    expect(output).toContain('Query: skew protection');
    expect(output).toContain('Skew Protection');
    expect(output).toContain('Hobby: Not available');
    expect(output).toContain('Pro: Included');
    expect(output).toContain('Available on Hobby: no');
  });

  it('outputs stable JSON without human output', async () => {
    useUser();
    useTeams('team_123', { billingPlan: 'pro' });
    client.config.currentTeam = 'team_123';
    mockPricing();
    client.setArgv('pricing', 'firewall', '--json');

    expect(await pricing(client)).toBe(0);

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.plan).toBe('pro');
    expect(payload.team).toMatchObject({
      id: 'team_123',
      plan: 'pro',
      normalizedPlan: 'pro',
    });
    expect(payload.source).toBe(PRICING_URL);
    expect(payload.query).toBe('firewall');
    expect(payload.summary.matched).toBeGreaterThan(0);
    expect(payload.features.hobby[0].name).toBe('Custom Firewall Rules');
    expect(payload.features.hobby[0].availableOnCurrentPlan).toBe(true);
    expect(payload.features.pro[0].name).toBe('System Bypass Rules');
    expect(payload.features.enterprise[0].name).toBe(
      'OWASP Core Ruleset (managed)'
    );
    expect(payload.features.enterprise[0].availableOnCurrentPlan).toBe(false);
    expect(client.getFullOutput()).toBe('');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:json', value: 'TRUE' },
      { key: 'argument:query', value: '[REDACTED]' },
    ]);
  });

  it('uses the personal account plan when no team is selected', async () => {
    useUser({
      billing: {
        plan: 'hobby',
        addons: [],
        period: { start: 0, end: 0 },
        platform: 'stripe',
        status: 'active',
        trial: { start: 0, end: 0 },
      },
    });
    mockPricing();
    client.setArgv('pricing', '--format', 'json');

    expect(await pricing(client)).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.team).toMatchObject({
      slug: 'Personal Account',
      plan: 'hobby',
      normalizedPlan: 'hobby',
    });
  });

  it('does not require authentication', () => {
    expect(SUBCOMMANDS_WITHOUT_TOKEN).toContain('pricing');
  });

  it('works without authentication', async () => {
    client.authConfig = {};
    mockPricing();
    client.setArgv('pricing');

    expect(await pricing(client)).toBe(0);

    const output = client.getFullOutput();
    expect(output).toContain('Current team: not logged in');
    expect(output).not.toContain('Current plan:');
    expect(output).toContain(PRICING_URL);
    expect(output).toContain('  HOBBY  ');
    expect(output).toContain('Skew Protection');
    expect(output).not.toContain('[not on current plan]');
  });

  it('omits team plan from JSON when unauthenticated', async () => {
    client.authConfig = {};
    mockPricing();
    client.setArgv('pricing', '--json');

    expect(await pricing(client)).toBe(0);

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.plan).toBeNull();
    expect(payload.team).toBeNull();
    expect(payload.source).toBe(PRICING_URL);
    expect(payload.summary.availableOnCurrentPlan).toBeNull();
    expect(payload.features.hobby.length).toBeGreaterThan(0);
  });

  it('handles a fetch failure', async () => {
    useUser();
    mockPricing('nope', 500);
    client.setArgv('pricing');

    expect(await pricing(client)).toBe(1);
    expect(client.getFullOutput()).toContain(
      'Failed to fetch Vercel pricing (500). Try again shortly.'
    );
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('emits a JSON error object for fetch failures with --json --non-interactive', async () => {
    client.nonInteractive = true;
    mockPricing('nope', 500);
    client.setArgv('pricing', '--json', '--non-interactive');

    expect(await pricing(client)).toBe(1);

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'api_error',
      message: 'Failed to fetch Vercel pricing (500). Try again shortly.',
    });
    expect(client.getFullOutput()).toBe('');
  });

  it('emits a JSON error object for unknown flags with --json', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    client.setArgv('pricing', '--json', '--not-a-flag');

    expect(await pricing(client)).toBe(1);

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
    expect(payload.message).toContain('unknown or unexpected option');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid output format', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    client.setArgv('pricing', '--format', 'yaml');

    expect(await pricing(client)).toBe(1);
    expect(client.getFullOutput()).toContain('Invalid output format: "yaml"');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('emits a JSON error object for invalid format with --json --non-interactive', async () => {
    client.nonInteractive = true;
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    client.setArgv(
      'pricing',
      '--format',
      'yaml',
      '--json',
      '--non-interactive'
    );

    expect(await pricing(client)).toBe(1);

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: 'Invalid output format: "yaml". Valid formats: json',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not follow off-host redirects', async () => {
    const originalFetch = globalThis.fetch.bind(globalThis);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url === PRICING_URL) {
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { location: 'https://evil.example/pricing.md' },
            })
          );
        }
        if (url.includes('evil.example')) {
          throw new Error('followed off-host redirect');
        }
        return originalFetch(input, init);
      });

    client.setArgv('pricing');
    expect(await pricing(client)).toBe(1);
    expect(client.getFullOutput()).toContain(
      'Failed to parse Vercel pricing. Unexpected response.'
    );
    expect(
      fetchMock.mock.calls.some(([request]) =>
        String(request).includes('evil.example')
      )
    ).toBe(false);
  });

  it('follows a same-host redirect to /pricing.md', async () => {
    const originalFetch = globalThis.fetch.bind(globalThis);
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === PRICING_URL) {
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: 'https://www.vercel.com/pricing.md' },
          })
        );
      }
      if (url === 'https://www.vercel.com/pricing.md') {
        return Promise.resolve(markdownResponse());
      }
      return originalFetch(input, init);
    });

    client.setArgv('pricing', '--json');
    expect(await pricing(client)).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.source).toBe('https://www.vercel.com/pricing.md');
    expect(payload.features.hobby.length).toBeGreaterThan(0);
  });

  it('rejects an oversized pricing response', async () => {
    mockPricing('x'.repeat(MAX_PRICING_BYTES + 1));
    client.setArgv('pricing');

    expect(await pricing(client)).toBe(1);
    expect(client.getFullOutput()).toContain(
      'Failed to parse Vercel pricing. Unexpected response.'
    );
  });

  it('rejects a response that only contains plan header markers', async () => {
    mockPricing('| Hobby |\n| Pro |\n');
    client.setArgv('pricing');

    expect(await pricing(client)).toBe(1);
    expect(client.getFullOutput()).toContain(
      'Failed to parse Vercel pricing. Unexpected response.'
    );
  });

  it('rejects a sparse table that parses but is too small', async () => {
    mockPricing(`# Pricing

| Feature | Hobby | Pro | Enterprise |
| --- | --- | --- | --- |
| Only One | Included | Included | Included |
`);
    client.setArgv('pricing');

    expect(await pricing(client)).toBe(1);
    expect(client.getFullOutput()).toContain(
      'Failed to parse Vercel pricing. Unexpected response.'
    );
  });
});

describe('isAllowedPricingUrl', () => {
  it('accepts the public pricing.md hosts', () => {
    expect(isAllowedPricingUrl(PRICING_URL)).toBe(true);
    expect(isAllowedPricingUrl('https://www.vercel.com/pricing.md')).toBe(true);
  });

  it('rejects http, other hosts, and userinfo', () => {
    expect(isAllowedPricingUrl('http://vercel.com/pricing.md')).toBe(false);
    expect(isAllowedPricingUrl('https://evil.example/pricing.md')).toBe(false);
    expect(
      isAllowedPricingUrl('https://vercel.com.evil.example/pricing.md')
    ).toBe(false);
    expect(isAllowedPricingUrl('https://user:pass@vercel.com/pricing.md')).toBe(
      false
    );
    expect(isAllowedPricingUrl('https://vercel.com/docs/pricing.md')).toBe(
      false
    );
  });
});
