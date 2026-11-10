import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import health from '../../../../src/commands/health';
import chars from '../../../../src/util/output/chars';
import ua from '../../../../src/util/ua';
import { client } from '../../../mocks/client';

const NOW = '2026-10-19T12:00:00.000Z';
/** The status dot, which is `o` on Windows. */
const DOT = chars.dot;

/** Matches a row whose value is a status dot and label. */
function row(label: string, state: string): RegExp {
  const escapeRegExp = (text: string) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `${escapeRegExp(label)}\\s+${escapeRegExp(DOT)} ${escapeRegExp(state)}`
  );
}
const SUMMARY_URL = 'https://www.vercel-status.com/api/v2/summary.json';
const INCIDENTS_URL = 'https://www.vercel-status.com/api/v2/incidents.json';

const page = {
  id: 'lvglq8h0mdyh',
  name: 'Vercel',
  url: 'https://www.vercel-status.com',
  time_zone: 'Etc/UTC',
  updated_at: '2026-10-19T11:58:00.000Z',
};

function component(
  id: string,
  name: string,
  status: string,
  groupId: string | null = null
) {
  return { id, name, status, group: false, group_id: groupId };
}

const components = [
  {
    id: 'grp_build',
    name: 'Build & Deploy',
    status: 'partial_outage',
    group: true,
    group_id: null,
  },
  {
    id: 'grp_dash',
    name: 'Dashboard',
    status: 'operational',
    group: true,
    group_id: null,
  },
  component('cmp_builds', 'Builds', 'partial_outage', 'grp_build'),
  component('cmp_dash_builds', 'Builds', 'operational', 'grp_dash'),
  component('cmp_api', 'API', 'operational'),
];

function incident(overrides: Record<string, unknown>) {
  return {
    id: 'inc_active',
    name: 'Increased build failures',
    status: 'investigating',
    impact: 'major',
    created_at: '2026-10-19T09:00:00.000Z',
    started_at: '2026-10-19T09:00:00.000Z',
    resolved_at: null,
    shortlink: 'https://stspg.io/active',
    components: [{ id: 'cmp_builds', name: 'Builds', group_id: 'grp_build' }],
    incident_updates: [
      {
        id: 'upd_2',
        status: 'investigating',
        body: 'We are investigating\nelevated build failures.',
        created_at: '2026-10-19T10:00:00.000Z',
      },
      {
        id: 'upd_1',
        status: 'investigating',
        body: 'First update.',
        created_at: '2026-10-19T09:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

const activeIncident = incident({});
const recentIncident = incident({
  id: 'inc_recent',
  name: 'Delayed log delivery',
  status: 'resolved',
  impact: 'minor',
  created_at: '2026-10-15T08:00:00.000Z',
  started_at: '2026-10-15T08:00:00.000Z',
  resolved_at: '2026-10-15T14:36:00.000Z',
  shortlink: 'https://stspg.io/recent',
  components: [],
});
const oldIncident = incident({
  id: 'inc_old',
  name: 'Old incident',
  status: 'resolved',
  started_at: '2026-10-01T08:00:00.000Z',
  resolved_at: '2026-10-01T09:00:00.000Z',
});

const maintenance = {
  id: 'mnt_1',
  name: 'Database upgrade',
  status: 'scheduled',
  impact: 'maintenance',
  scheduled_for: '2026-10-20T02:00:00.000Z',
  scheduled_until: '2026-10-20T04:00:00.000Z',
  shortlink: 'https://stspg.io/maint',
  components: [{ id: 'cmp_api', name: 'API', group_id: null }],
};

function summaryBody(overrides: Record<string, unknown> = {}) {
  return {
    page,
    status: { indicator: 'major', description: 'Partial System Outage' },
    components,
    incidents: [activeIncident],
    scheduled_maintenances: [maintenance],
    ...overrides,
  };
}

function incidentsBody(
  list: unknown[] = [activeIncident, recentIncident, oldIncident]
) {
  return { page, incidents: list };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockStatusPage(
  summary: unknown = summaryBody(),
  incidents: unknown = incidentsBody()
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url === SUMMARY_URL) return json(summary);
    if (url === INCIDENTS_URL) return json(incidents);
    throw new Error(`Unexpected request: ${url}`);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('health', () => {
  it('requests the public status page without authorization', async () => {
    const fetchMock = mockStatusPage();
    client.setArgv('health');

    expect(await health(client)).toBe(0);

    const urls = fetchMock.mock.calls.map(([url]) => String(url)).sort();
    expect(urls).toEqual([INCIDENTS_URL, SUMMARY_URL]);
    for (const [, init] of fetchMock.mock.calls) {
      const headers = new Headers(init?.headers);
      expect(headers.get('user-agent')).toBe(ua);
      expect(headers.has('authorization')).toBe(false);
    }
  });

  it('prints the current status, active and recent incidents on stdout', async () => {
    mockStatusPage();
    client.setArgv('health');

    expect(await health(client)).toBe(0);

    const out = client.stdout.getFullOutput();
    // One blank line separates the report from the version banner.
    expect(out.startsWith(`\n  ${DOT} Partial System Outage\n`)).toBe(true);
    // Headings are followed by a blank line before the first block.
    expect(out).toContain('Active incidents\n\n  Increased build failures');
    expect(out).toContain('https://www.vercel-status.com');
    expect(out).toContain('Oct 19, 2026, 11:58 UTC (2m ago)');

    // Degraded components show their group, so duplicate names stay distinct.
    expect(out).toMatch(row('Build & Deploy / Builds', 'Partial outage'));
    expect(out).not.toContain('Dashboard / Builds');
    expect(out).not.toMatch(/^ {2}API\s+Operational/m);

    expect(out).toContain('Active incidents');
    expect(out).toContain('Increased build failures');
    expect(out).toMatch(row('Impact', 'Major'));
    expect(out).toMatch(row('Status', 'Investigating'));
    // Remote newlines collapse so each field stays on one line.
    expect(out).toContain('We are investigating elevated build failures.');
    expect(out).not.toContain('First update.');
    // Links use the status page's own domain, not the API's shortlink.
    expect(out).toContain('https://www.vercel-status.com/incidents/inc_active');
    expect(out).not.toContain('stspg.io');

    expect(out).toContain('Scheduled maintenance');
    expect(out).toContain('Database upgrade');
    expect(out).toMatch(/Starts\s+Oct 20, 2026, 02:00 UTC \(in 14h\)/);
    expect(out).toMatch(/Ends\s+Oct 20, 2026, 04:00 UTC \(in 16h\)/);

    expect(out).toContain('Resolved in the last 7 days');
    expect(out).toContain('Delayed log delivery');
    expect(out).toContain('after 6h 36m');
    expect(out).not.toContain('Old incident');
  });

  it('says so when nothing is happening', async () => {
    mockStatusPage(
      summaryBody({
        status: { indicator: 'none', description: 'All Systems Operational' },
        components: [component('cmp_api', 'API', 'operational')],
        incidents: [],
        scheduled_maintenances: [],
      }),
      incidentsBody([oldIncident])
    );
    client.setArgv('health');

    expect(await health(client)).toBe(0);

    const out = client.stdout.getFullOutput();
    expect(out).toContain('All Systems Operational');
    expect(out).toContain('No active incidents.');
    expect(out).toContain('No incidents resolved in the last 7 days.');
    expect(out).not.toContain('Degraded components');
    expect(out).not.toContain('Scheduled maintenance');
  });

  it('strips control and format characters from remote text', async () => {
    mockStatusPage(
      summaryBody({
        incidents: [
          incident({ name: '\u001b[31mSpoofed\u001b[0m\u202e name\u0007' }),
        ],
      })
    );
    client.setArgv('health');

    expect(await health(client)).toBe(0);

    const out = client.stdout.getFullOutput();
    expect(out).toContain('Spoofed name');
    expect(out).not.toContain('\u001b[31m');
    expect(out).not.toContain('\u202e');
    expect(out).not.toContain('\u0007');
  });

  it('prints one JSON document on stdout and nothing on stderr', async () => {
    mockStatusPage();
    client.setArgv('health', '--json');

    expect(await health(client)).toBe(0);

    expect(client.stderr.getFullOutput()).toBe('');
    const report = JSON.parse(client.stdout.getFullOutput());
    expect(report.page).toEqual({
      name: 'Vercel',
      url: 'https://www.vercel-status.com',
      updatedAt: '2026-10-19T11:58:00.000Z',
    });
    expect(report.status).toEqual({
      indicator: 'major',
      description: 'Partial System Outage',
    });
    expect(report.since).toBe('2026-10-12T12:00:00.000Z');
    // Every component, groups excluded, each with its group name.
    expect(report.components).toEqual([
      {
        id: 'cmp_builds',
        name: 'Builds',
        group: 'Build & Deploy',
        status: 'partial_outage',
      },
      {
        id: 'cmp_dash_builds',
        name: 'Builds',
        group: 'Dashboard',
        status: 'operational',
      },
      { id: 'cmp_api', name: 'API', group: null, status: 'operational' },
    ]);
    // Active and recently resolved, newest first; the old one is dropped.
    expect(report.incidents.map((i: { id: string }) => i.id)).toEqual([
      'inc_active',
      'inc_recent',
    ]);
    expect(report.incidents[0]).toEqual({
      id: 'inc_active',
      name: 'Increased build failures',
      status: 'investigating',
      impact: 'major',
      startedAt: '2026-10-19T09:00:00.000Z',
      resolvedAt: null,
      url: 'https://www.vercel-status.com/incidents/inc_active',
      components: [
        { id: 'cmp_builds', name: 'Builds', group: 'Build & Deploy' },
      ],
      updates: [
        {
          id: 'upd_2',
          status: 'investigating',
          body: 'We are investigating\nelevated build failures.',
          createdAt: '2026-10-19T10:00:00.000Z',
        },
        {
          id: 'upd_1',
          status: 'investigating',
          body: 'First update.',
          createdAt: '2026-10-19T09:00:00.000Z',
        },
      ],
    });
    expect(report.scheduledMaintenances).toEqual([
      {
        id: 'mnt_1',
        name: 'Database upgrade',
        status: 'scheduled',
        impact: 'maintenance',
        scheduledFor: '2026-10-20T02:00:00.000Z',
        scheduledUntil: '2026-10-20T04:00:00.000Z',
        url: 'https://www.vercel-status.com/incidents/mnt_1',
        components: [{ id: 'cmp_api', name: 'API', group: null }],
      },
    ]);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('prefers the summary for incidents that are still open', async () => {
    const stale = incident({ status: 'investigating' });
    const fresh = incident({ status: 'monitoring' });
    mockStatusPage(summaryBody({ incidents: [fresh] }), incidentsBody([stale]));
    client.setArgv('health', '--json');

    expect(await health(client)).toBe(0);

    const report = JSON.parse(client.stdout.getFullOutput());
    expect(report.incidents).toHaveLength(1);
    expect(report.incidents[0].status).toBe('monitoring');
  });

  it('renders unknown status values instead of failing', async () => {
    mockStatusPage(
      summaryBody({
        components: [component('cmp_api', 'API', 'brownout')],
        incidents: [incident({ impact: 'severe', status: 'triaging' })],
      })
    );
    client.setArgv('health');

    expect(await health(client)).toBe(0);

    const out = client.stdout.getFullOutput();
    expect(out).toMatch(row('API', 'Brownout'));
    expect(out).toMatch(row('Impact', 'Severe'));
    expect(out).toMatch(row('Status', 'Triaging'));
  });

  describe('failures', () => {
    it('reports a network error with the status page URL', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new TypeError('fetch failed')
      );
      client.setArgv('health');

      expect(await health(client)).toBe(1);

      const err = client.stderr.getFullOutput();
      expect(err).toContain(
        "Couldn't reach www.vercel-status.com. The connection failed."
      );
      expect(err).toContain('https://www.vercel-status.com');
      expect(client.stdout.getFullOutput()).toBe('');
    });

    it('reports a timeout', async () => {
      const timeout = Object.assign(new Error('The operation timed out.'), {
        name: 'TimeoutError',
      });
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(timeout);
      client.setArgv('health');

      expect(await health(client)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        "Couldn't reach www.vercel-status.com. The request timed out."
      );
    });

    it('writes a JSON error document to stderr with --json', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new TypeError('fetch failed')
      );
      client.setArgv('health', '--json');

      expect(await health(client)).toBe(1);

      expect(client.stdout.getFullOutput()).toBe('');
      const lines = client.stderr.getFullOutput().trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({
        status: 'error',
        reason: 'network_error',
        message: "Couldn't reach www.vercel-status.com. The connection failed.",
        retryable: true,
      });
    });

    it('maps an HTTP error to api_error with the status as detail', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, 503));
      client.setArgv('health', '--json');

      expect(await health(client)).toBe(1);

      const document = JSON.parse(client.stderr.getFullOutput().trim());
      expect(document).toMatchObject({
        reason: 'api_error',
        data: { detail: 'HTTP status 503' },
      });
      expect(document.message).not.toContain('503');
    });

    it('maps 429 to rate_limited', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, 429));
      client.setArgv('health');

      expect(await health(client)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Too many requests to www.vercel-status.com.'
      );
    });

    it('reports a timeout while reading the body as a retryable network error', async () => {
      const timeout = Object.assign(new Error('The operation timed out.'), {
        name: 'TimeoutError',
      });
      const response = json(summaryBody());
      vi.spyOn(response, 'text').mockRejectedValue(timeout);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
      client.setArgv('health', '--json');

      expect(await health(client)).toBe(1);

      expect(JSON.parse(client.stderr.getFullOutput().trim())).toMatchObject({
        reason: 'network_error',
        message: "Couldn't reach www.vercel-status.com. The request timed out.",
        retryable: true,
      });
    });

    it('rejects a body that is not JSON', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async () => new Response('<html>Maintenance</html>', { status: 200 })
      );
      client.setArgv('health', '--json');

      expect(await health(client)).toBe(1);

      expect(JSON.parse(client.stderr.getFullOutput().trim())).toMatchObject({
        reason: 'api_error',
        retryable: false,
      });
    });

    it('rejects a response with an unexpected shape', async () => {
      mockStatusPage({ page }, incidentsBody());
      client.setArgv('health', '--json');

      expect(await health(client)).toBe(1);

      expect(JSON.parse(client.stderr.getFullOutput().trim())).toMatchObject({
        reason: 'api_error',
        retryable: false,
      });
    });
  });

  describe('usage', () => {
    it('rejects an unknown option before any request', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch');
      client.setArgv('health', '--bogus');

      expect(await health(client)).toBe(2);
      expect(client.stderr.getFullOutput()).toContain('--bogus');
      expect(client.stderr.getFullOutput()).toContain(
        '\n    vercel health --help\n'
      );
      expect(client.stderr.getFullOutput()).not.toContain('`');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects an unknown option as JSON with --json', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch');
      client.setArgv('health', '--json', '--bogus');

      expect(await health(client)).toBe(2);
      expect(client.stdout.getFullOutput()).toBe('');
      expect(JSON.parse(client.stderr.getFullOutput().trim())).toMatchObject({
        reason: 'invalid_arguments',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects extra arguments before any request', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch');
      client.setArgv('health', 'builds');

      expect(await health(client)).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        'Unknown command builds for vercel health.'
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
