import { describe, expect, it, beforeEach, vi } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useFirewallActivity,
  useListFirewallConfigs,
  createConfig,
  createRule,
  firewallActivity,
  createO11yFirewallAlert,
  FIREWALL_ROLLUP_COLUMN,
  RATE_LIMIT_MESSAGE,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { setTeamBillingPlan, useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { teamCache } from '../../../../src/util/teams/get-team-by-id-or-slug';
import { failFirewallObservabilityPlan } from '../../../../src/commands/firewall/shared';
import { APIError } from '../../../../src/util/errors-ts';
import type { Response } from '../../../../src/util/fetch';
import { expectDeprecationInJson } from '../../../helpers/deprecation-warning';

const HOUR = 3_600_000;
const WINDOW_START = Date.UTC(2026, 8, 6, 12, 0, 0);

function apiError(message: string) {
  return new APIError(message, {
    status: 402,
    headers: { get: () => null },
  } as unknown as Response);
}

function actionSeries() {
  return {
    series: [
      {
        timestamp: new Date(WINDOW_START).toISOString(),
        wafAction: 'deny',
        value: 900,
      },
      {
        timestamp: new Date(WINDOW_START + HOUR).toISOString(),
        wafAction: 'deny',
        value: 1_500,
      },
      {
        timestamp: new Date(WINDOW_START).toISOString(),
        wafAction: 'allow',
        value: 40_000,
      },
    ],
    actionSummary: [
      { wafAction: 'deny', [FIREWALL_ROLLUP_COLUMN]: 2_400 },
      { wafAction: 'allow', [FIREWALL_ROLLUP_COLUMN]: 40_000 },
    ],
  };
}

/** Summary rows for every dimension the default report asks for. */
function defaultTopLists() {
  return {
    byField: {
      clientJa4Digest: {
        summary: [
          {
            clientJa4Digest: 't13d1516h2_x_y',
            [FIREWALL_ROLLUP_COLUMN]: 2_400,
          },
        ],
      },
      clientUserAgent: {
        summary: [
          { clientUserAgent: 'curl/8.0', [FIREWALL_ROLLUP_COLUMN]: 2_400 },
        ],
      },
      botName: {
        summary: [
          { botName: 'github-hookshot', [FIREWALL_ROLLUP_COLUMN]: 900 },
        ],
      },
      botCategory: {
        summary: [
          { botCategory: 'ai_scraper', [FIREWALL_ROLLUP_COLUMN]: 1_200 },
        ],
      },
      clientIp: {
        summary: [
          { clientIp: '1.2.3.4', [FIREWALL_ROLLUP_COLUMN]: 1_800 },
          { clientIp: '5.6.7.8', [FIREWALL_ROLLUP_COLUMN]: 600 },
        ],
      },
      'asnName,asnId': {
        summary: [
          {
            asnName: 'EXAMPLE-AS',
            asnId: '64500',
            [FIREWALL_ROLLUP_COLUMN]: 2_400,
          },
        ],
      },
      requestPath: {
        summary: [
          { requestPath: '/api/login', [FIREWALL_ROLLUP_COLUMN]: 2_000 },
        ],
      },
      wafRuleId: {
        summary: [
          {
            wafRuleId: 'sys_dos_mitigation',
            [FIREWALL_ROLLUP_COLUMN]: 2_400,
          },
        ],
      },
      requestHostname: {
        summary: [
          { requestHostname: 'example.com', [FIREWALL_ROLLUP_COLUMN]: 2_400 },
        ],
      },
    },
  };
}

describe('firewall traffic list', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'firewall-test-project',
      name: 'firewall-test',
    });
    client.cwd = setupUnitFixture('commands/firewall');
    useFirewallActivity({ ...actionSeries(), ...defaultTopLists() });
  });

  it('names custom rules from the firewall config, as overview does', async () => {
    useListFirewallConfigs(
      createConfig({ rules: [{ ...createRule(1), id: 'rule_001' }] }),
      null
    );
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        wafRuleId: {
          summary: [{ wafRuleId: 'rule_001', [FIREWALL_ROLLUP_COLUMN]: 2_400 }],
        },
      },
    });

    client.setArgv('firewall', 'traffic', 'list', '--dimension', 'rule');
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Test Rule 1');
    expect(out).not.toContain('rule_001');
  });

  it('falls back to rule ids when the config cannot be read', async () => {
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        wafRuleId: {
          summary: [{ wafRuleId: 'rule_001', [FIREWALL_ROLLUP_COLUMN]: 2_400 }],
        },
      },
    });

    client.setArgv('firewall', 'traffic', 'list', '--dimension', 'rule');
    expect(await firewall(client)).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('rule_001');
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'traffic', 'list', '--help');
      expect(await firewall(client)).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:traffic', value: 'traffic' },
        { key: 'flag:help', value: 'firewall:traffic:list' },
      ]);
    });

    it('names the default panels', async () => {
      client.setArgv('firewall', 'traffic', 'list', '--help');
      expect(await firewall(client)).toEqual(0);
      const out = client.stderr.getFullOutput().replace(/\s+/g, ' ');
      expect(out).toContain(
        'default: ip, ja4, asn, user-agent, path, rule, host, bot'
      );
      expect(out).not.toContain('default: ip, asn, path, rule, host');
    });
  });

  it('reports requests by action and the default top lists', async () => {
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('Firewall traffic');
    expect(out).toContain('Requests by Action');
    expect(out).toContain('Deny');
    expect(out).toContain('2.4k');
    expect(out).toContain('Top IPs');
    expect(out).toContain('1.2.3.4');
    expect(out).toContain('Top AS Names');
    expect(out).toContain('Top Request Paths');
    expect(out).toContain('Top Hosts');
    // The dashboard's traffic page, in its order.
    expect(out).toContain('Top JA4 Digests');
    expect(out).toContain('Top User Agents');
    expect(out).toContain('Verified Bots');
    // Rule ids read as opaque, so the well-known ones show by name.
    expect(out).toContain('DDoS Mitigation');
    expect(out).not.toContain('sys_dos_mitigation');
    expect(out).toContain('firewall traffic inspect <dimension> <value>');
  });

  it('queries one action timeseries and one list per dimension', async () => {
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(0);

    const groupBys = firewallActivity.queries.map(q =>
      (q.groupBy ?? []).join()
    );
    expect(groupBys).toContain('wafAction');
    expect(groupBys.sort()).toEqual(
      [
        'asnName,asnId',
        'botName',
        'clientIp',
        'clientJa4Digest',
        'clientUserAgent',
        'requestHostname',
        'requestPath',
        'wafAction',
        'wafRuleId',
      ].sort()
    );
    for (const query of firewallActivity.queries) {
      expect(query.metric).toEqual('vercel.firewall_action.count');
      expect(query.filter ?? '').not.toContain('botVerified');
    }
  });

  it('groups Top AS Names by name and ASN id', async () => {
    client.setArgv('firewall', 'traffic', 'list', '--dimension', 'asn');
    expect(await firewall(client)).toEqual(0);

    const asn = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('asnName')
    );
    expect(asn?.metric).toEqual('vercel.firewall_action.count');
    expect(asn?.groupBy).toEqual(['asnName', 'asnId']);
    expect(asn?.filter).toEqual('(asnId!="") AND (asnName!="")');
    // Extra group-by field: 5 + 1 + 16.
    expect(asn?.rowLimit).toEqual(22);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('EXAMPLE-AS (64500)');
  });

  it('keeps Top AS Names filled when empty-name groups lead the list', async () => {
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        'asnName,asnId': {
          summary: [
            { asnName: '', asnId: '1', [FIREWALL_ROLLUP_COLUMN]: 9_000 },
            { asnName: '', asnId: '2', [FIREWALL_ROLLUP_COLUMN]: 8_000 },
            {
              asnName: 'EXAMPLE-AS',
              asnId: '64500',
              [FIREWALL_ROLLUP_COLUMN]: 2_400,
            },
            {
              asnName: 'EXAMPLE-AS',
              asnId: '64501',
              [FIREWALL_ROLLUP_COLUMN]: 1_200,
            },
          ],
        },
      },
    });
    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--dimension',
      'asn',
      '--top',
      '2'
    );
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('EXAMPLE-AS (64500)');
    expect(out).toContain('EXAMPLE-AS (64501)');
    const asn = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('asnName')
    );
    // 2 + 1 + 16, enough to skip the empty-name groups and still fill --top.
    expect(asn?.rowLimit).toEqual(19);
  });

  it('reads verified bots off the firewall metric, which reports them without Observability Plus', async () => {
    client.setArgv('firewall', 'traffic', 'list', '--dimension', 'bot');
    expect(await firewall(client)).toEqual(0);

    const bots = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('botName')
    );
    expect(bots?.metric).toEqual('vercel.firewall_action.count');
    expect(bots?.body?.metrics.value.aggregation).toEqual('count');
    expect(bots?.filter).toEqual('botName!=""');
    expect(bots?.filter).not.toContain('botVerified');
    expect(bots?.rowLimit).toEqual(6);
    expect(bots?.body?.orderBy).toEqual([
      { metric: 'value', direction: 'desc' },
    ]);
    expect(bots?.body?.scope).toEqual({
      ownerId: 'team_dummy',
      projectIds: ['firewall-test-project'],
    });
    const actions = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('wafAction')
    );
    expect(actions?.metric).toEqual('vercel.firewall_action.count');
  });

  it('can combine verified bots with a firewall action filter', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--dimension',
      'bot',
      '--action',
      'deny'
    );
    expect(await firewall(client)).toEqual(0);

    const bots = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('botName')
    );
    expect(bots?.metric).toEqual('vercel.firewall_action.count');
    expect(bots?.filter).toContain('botName!=""');
    expect(bots?.filter).toContain('wafAction:"deny"');
    expect(bots?.filter).not.toContain('botVerified');
  });

  it('reads unknown bots off request counts, grouped by category', async () => {
    client.setArgv('firewall', 'traffic', 'list', '--dimension', 'unknown-bot');
    expect(await firewall(client)).toEqual(0);

    const bots = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('botCategory')
    );
    expect(bots?.metric).toEqual('vercel.request.count');
    expect(bots?.filter).toContain('botVerified!="pass"');
    expect(bots?.filter).toContain('botCategory!=""');
    const actions = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('wafAction')
    );
    expect(actions?.metric).toEqual('vercel.firewall_action.count');
  });

  it('rejects a request-count filter on the firewall-action list', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--unknown-bot',
      'ai_scraper'
    );
    expect(await firewall(client)).toEqual(2);

    const out = client.stderr.getFullOutput();
    expect(out).toContain("Can't combine --unknown-bot");
    expect(out).toContain('Inspect unknown-bot');
    expect(firewallActivity.queries).toEqual([]);
  });

  it('says a list the filters cannot reach is unavailable, not empty', async () => {
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        botCategory: {
          status: 400,
          message: 'Invalid metrics request',
          issues: [
            {
              path: 'metrics.value.filter',
              message:
                'Metric "vercel.request.count" does not support filtered dimension "wafAction"',
            },
          ],
        },
      },
    });
    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--dimension',
      'unknown-bot',
      '--action',
      'deny'
    );
    // The only list asked for is one this filter cannot reach, so the report
    // is empty and says so rather than reporting success with no rows.
    expect(await firewall(client)).toEqual(1);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Not reported alongside the filters in use.');
    expect(out).not.toContain("Couldn't load this table.");
  });

  it('drops rows carrying no value for the dimension', async () => {
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        wafRuleId: {
          summary: [
            // Traffic no rule matched, which outweighs every real rule.
            { wafRuleId: '', [FIREWALL_ROLLUP_COLUMN]: 4_000_000_000 },
            { wafRuleId: 'rule_abc123', [FIREWALL_ROLLUP_COLUMN]: 2_400 },
          ],
        },
      },
    });
    client.setArgv('firewall', 'traffic', 'list', '--dimension', 'rule');
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('rule_abc123');
    expect(out).not.toContain('(not set)');
    expect(out).not.toContain('4000.0M');
  });

  it('renders --top rows when the unattributed row leads the list', async () => {
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        clientIp: {
          summary: [
            // Requests the dimension does not describe. They outweigh every
            // real row, so they sort first and are dropped after the API has
            // already capped the result.
            { clientIp: '', [FIREWALL_ROLLUP_COLUMN]: 4_000_000 },
            { clientIp: '1.1.1.1', [FIREWALL_ROLLUP_COLUMN]: 5_000 },
            { clientIp: '2.2.2.2', [FIREWALL_ROLLUP_COLUMN]: 4_000 },
            { clientIp: '3.3.3.3', [FIREWALL_ROLLUP_COLUMN]: 3_000 },
          ],
        },
      },
    });

    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--dimension',
      'ip',
      '--top',
      '3'
    );
    expect(await firewall(client)).toEqual(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('1.1.1.1');
    expect(out).toContain('2.2.2.2');
    // The row a `--top 3` used to lose to the blank one.
    expect(out).toContain('3.3.3.3');
    expect(out).not.toContain('4000.0M');
  });

  it('keeps the rule id beside the name it renders', async () => {
    useListFirewallConfigs(
      createConfig({ rules: [{ ...createRule(1), id: 'rule_001' }] }),
      null
    );
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        wafRuleId: {
          summary: [{ wafRuleId: 'rule_001', [FIREWALL_ROLLUP_COLUMN]: 2_400 }],
        },
      },
    });

    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--dimension',
      'rule',
      '--json'
    );
    expect(await firewall(client)).toEqual(0);

    const json = JSON.parse(client.stdout.getFullOutput());
    const rules = json.topLists.find((l: any) => l.dimension === 'rule');
    // `traffic inspect rule <value>` filters the metric on the id, and a rule
    // name is not a filter it accepts — so the name cannot replace it.
    expect(rules.rows[0].value).toEqual('rule_001');
    expect(rules.rows[0].label).toEqual('Test Rule 1');
  });

  it('blames --since, not an alert, for a window that starts in the future', async () => {
    // A relative `--since` is always in the past, but an ISO date is taken as
    // given and nothing upstream rejects a future one. `validateTimeOrder`
    // only compares the two flags when both are passed, so this reaches the
    // inverted-window guard with no `--until` and no alert to blame.
    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--since',
      '2099-01-01T00:00:00.000Z'
    );
    expect(await firewall(client)).toEqual(2);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('`--since` is in the future');
    expect(out).not.toContain('alert');
    expect(out).not.toContain('--until');
    expect(firewallActivity.queries).toEqual([]);
  });

  it('asks the Observability API for counts, not sums', async () => {
    client.setArgv('firewall', 'traffic', 'list', '--dimension', 'ip');
    expect(await firewall(client)).toEqual(0);

    for (const query of firewallActivity.queries) {
      const body = query.body!;
      expect(body.scope).toEqual({
        ownerId: 'team_dummy',
        projectIds: ['firewall-test-project'],
      });
      expect(body.timeRange.start).toMatch(/Z$/);
      expect(body.outputs).toEqual(['value']);
      // `vercel.firewall_action.count` is a count metric: `sum` is rejected
      // rather than answered.
      expect(body.metrics.value.aggregation).toEqual('count');
    }
  });

  it('reads a top list as a summary and the chart as a series', async () => {
    client.setArgv('firewall', 'traffic', 'list', '--dimension', 'ip');
    expect(await firewall(client)).toEqual(0);

    const top = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('clientIp')
    )!;
    // A summary covers the window exactly and is ordered and capped by the
    // API, so a top list pays for no buckets it would never draw.
    expect(top.bucketSeconds).toBeUndefined();
    // One over `--top`: the row carrying no value for the dimension is
    // dropped afterwards, so asking for exactly five would render four.
    expect(top.rowLimit).toEqual(6);
    expect(top.body!.orderBy).toEqual([{ metric: 'value', direction: 'desc' }]);
    expect(top.body!.seriesSelection).toBeUndefined();

    const actions = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('wafAction')
    )!;
    // A bucketed query is complete or it fails, so it narrows through
    // `seriesSelection`; `rowLimit` and `orderBy` are rejected beside it.
    expect(actions.bucketSeconds).toEqual(3_600);
    expect(actions.seriesLimit).toEqual(100);
    expect(actions.rowLimit).toBeUndefined();
    expect(actions.body!.orderBy).toBeUndefined();
  });

  it('buckets the window to what the terminal can draw', async () => {
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(0);

    const actions = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('wafAction')
    );
    const start = new Date(actions?.startTime ?? 0).getTime();
    const end = new Date(actions?.endTime ?? 0).getTime();
    // The window asked for, rounded out to whole buckets — which is the
    // window the API charts a bucketed query over whether or not it is asked
    // to, so it is the one every query here is given.
    expect(start % HOUR).toEqual(0);
    expect(end % HOUR).toEqual(0);
    expect(end - start).toBeGreaterThanOrEqual(24 * HOUR);
    expect(end - start).toBeLessThanOrEqual(26 * HOUR);
    // A sparkline is one character per bucket, so 24h of the dashboard's 15m
    // buckets would be 96 characters of trend on an 80-column terminal.
    expect(actions?.granularity).toEqual({ hours: 1 });

    // The unbucketed top lists cover that same window: rounding one and not
    // the other is how a chart came to report traffic its top lists could
    // not account for.
    const windows = new Set(
      firewallActivity.queries.map(q => `${q.startTime}/${q.endTime}`)
    );
    expect(windows.size).toEqual(1);
  });

  it('resolves --json the same way in any terminal', async () => {
    // The bucket count is a sparkline's width, and a sparkline is not what
    // `--json` prints: a wide terminal must not hand a script a different
    // `period.granularity` and a different number of points from a narrow one.
    const wide = vi.spyOn(client.stderr, 'columns', 'get').mockReturnValue(200);
    try {
      client.setArgv(
        'firewall',
        'traffic',
        'list',
        '--json',
        '--dimension',
        'ip'
      );
      expect(await firewall(client)).toEqual(0);
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.period.granularity).toEqual({ hours: 1 });

      // The same wide terminal does buy the printed report finer buckets —
      // which is what makes the reading above a contract rather than a
      // coincidence of this terminal being 80 columns wide.
      firewallActivity.queries = [];
      client.setArgv('firewall', 'traffic', 'list', '--dimension', 'ip');
      expect(await firewall(client)).toEqual(0);
      const actions = firewallActivity.queries.find(q =>
        (q.groupBy ?? []).includes('wafAction')
      );
      expect(actions?.granularity).toEqual({ minutes: 15 });
    } finally {
      wide.mockRestore();
    }
  });

  it('shows only the dimensions asked for', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--dimension',
      'country,user-agent'
    );
    expect(await firewall(client)).toEqual(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('Top Countries');
    expect(out).toContain('Top User Agents');
    expect(out).not.toContain('Top IPs');
    const groupBys = firewallActivity.queries.map(q =>
      (q.groupBy ?? []).join()
    );
    expect(groupBys).not.toContain('clientIp');
  });

  it('rejects an unknown dimension and names the ones that exist', async () => {
    client.setArgv('firewall', 'traffic', 'list', '--dimension', 'browser');
    expect(await firewall(client)).toEqual(2);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Unknown --dimension "browser"');
    expect(out).toContain('user-agent');
    expect(firewallActivity.queries).toEqual([]);
  });

  it('rejects a --top outside the supported range', async () => {
    client.setArgv('firewall', 'traffic', 'list', '--top', '500');
    expect(await firewall(client)).toEqual(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--limit` must be an integer between 1 and 100'
    );
  });

  it('turns dimension flags and raw filters into one KQL filter', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--action',
      'deny',
      '--host',
      "o'brien.com",
      '--filter',
      'requestPath!="/health"',
      '--dimension',
      'ip'
    );
    expect(await firewall(client)).toEqual(0);

    const top = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('clientIp')
    );
    // Quoted, so an apostrophe cannot be read as KQL syntax.
    expect(top?.filter).toContain('requestHostname:"o\'brien.com"');
    expect(top?.filter).toContain('wafAction:"deny"');
    expect(top?.filter).toContain('requestPath!="/health"');
    // The dimension's own exclusion rides along with the caller's filter.
    expect(top?.filter).toContain('clientIp!="127.0.0.1"');
  });

  it('says which filter syntax it reads when handed OData', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--filter',
      "requestPath ne '/health'",
      '--dimension',
      'ip'
    );
    expect(await firewall(client)).toEqual(0);

    // Passed on rather than rejected — the API is the authority on what it
    // accepts — but the syntax changed with the endpoint, so say so.
    const out = client.stderr.getFullOutput();
    expect(out).toContain('KQL will be the only supported filter syntax');
    const top = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('clientIp')
    );
    expect(top?.filter).toContain("requestPath ne '/health'");
  });

  it('names the filters when a narrowed window is empty', async () => {
    useFirewallActivity({
      ...actionSeries(),
      byField: { clientIp: { summary: [] } },
    });
    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--dimension',
      'ip',
      '--action',
      'deny'
    );
    expect(await firewall(client)).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No requests match the current filters.'
    );
  });

  it('reports an unfiltered empty window without blaming a filter', async () => {
    useFirewallActivity({
      ...actionSeries(),
      byField: { clientIp: { summary: [] } },
    });
    client.setArgv('firewall', 'traffic', 'list', '--dimension', 'ip');
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('No requests in this period.');
    expect(out).not.toContain('current filters');
  });

  it('keeps the report when one list fails', async () => {
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        ...defaultTopLists().byField,
        clientIp: { status: 500 },
      },
    });
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain("Couldn't load this table.");
    expect(out).toContain('EXAMPLE-AS');
  });

  it('names a rate limit rather than calling the table unloadable', async () => {
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        ...defaultTopLists().byField,
        clientIp: { status: 429, retryAfter: 30, message: '' },
      },
    });
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('Rate limited by the Observability API.');
    expect(out).toContain('Retry in 30s.');
    // The panels that answered are still the report.
    expect(out).toContain('EXAMPLE-AS');
  });

  it('says a panel timed out rather than calling it unloadable', async () => {
    // User agent and path are the highest-cardinality dimensions, so they are
    // the first to blow the query deadline on a busy project. "Couldn't load
    // this table" named neither the cause nor anything to do about it.
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        ...defaultTopLists().byField,
        clientUserAgent: { status: 408 },
      },
    });
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('Timed out. Narrow the window with `--since`');
    expect(out).not.toContain("Couldn't load this table.");
    expect(out).toContain('EXAMPLE-AS');
  });

  it("relays the API's rate-limit message, which names who can raise it", async () => {
    // The API says which budget was spent and that an account team can raise
    // it. Replacing that with a generic line loses the only actionable half.
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        ...defaultTopLists().byField,
        clientIp: { status: 429, retryAfter: 86_400 },
      },
    });
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('Request a higher usage limit');
    // Relayed in place of ours, not alongside it.
    expect(out).not.toContain('Rate limited by the Observability API.');
  });

  it('says a day rather than 86400s when a quota is exhausted', async () => {
    // An exhausted daily quota answers `Retry-After: 86400`, and no reader
    // can judge that in seconds. This is the fallback wording, for an API
    // that refused without saying why.
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        ...defaultTopLists().byField,
        clientIp: { status: 429, retryAfter: 86_400, message: '' },
      },
    });
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('Retry in 24 hours.');
    expect(out).not.toContain('86400');
  });

  it('fails the command when every list is refused for one reason', async () => {
    // The API rate limits these queries per team, so a busy report can have
    // every panel refused at once. Eight identical apologies read as eight
    // unrelated failures, and exiting 0 tells a script the report arrived.
    const byField = Object.fromEntries(
      Object.keys(defaultTopLists().byField).map(field => [
        field,
        { status: 429, retryAfter: 30 },
      ])
    );
    useFirewallActivity({ ...actionSeries(), byField });

    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(1);

    const out = client.stderr.getFullOutput();
    // Said once, not once per panel — and in the API's words, not ours.
    expect(out.match(/Request a higher usage limit/g)).toHaveLength(1);
    expect(out).toContain('No top lists:');
    // The chart still answered, so it is still shown.
    expect(out).toContain('Requests by Action');
    // Nothing to break down, so the invitation to do so is withheld.
    expect(out).not.toContain('Break any of these values down further');
  });

  it('fails when the only panel asked for is the one that failed', async () => {
    // One panel is too few to collapse, but losing the only list asked for
    // is still a report that did not arrive.
    useFirewallActivity({
      ...actionSeries(),
      byField: { requestPath: { status: 408 } },
    });

    client.setArgv('firewall', 'traffic', 'list', '--dimension', 'path');
    expect(await firewall(client)).toEqual(1);

    const out = client.stderr.getFullOutput();
    // Not collapsed: with one panel its own heading is the clearer form.
    expect(out).toContain('Top Request Paths');
    expect(out).toContain('Timed out.');
    expect(out).not.toContain('No top lists:');
    expect(out).not.toContain('Break any of these values down further');
  });

  it('fails when every panel failed for reasons that disagree', async () => {
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        requestPath: { status: 408 },
        clientIp: { status: 429, retryAfter: 30 },
      },
    });

    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--dimension',
      'path',
      '--dimension',
      'ip'
    );
    expect(await firewall(client)).toEqual(1);

    const out = client.stderr.getFullOutput();
    // Two reasons, so each is worth reading under its own heading.
    expect(out).toContain('Timed out.');
    expect(out).toContain('Request a higher usage limit');
    expect(out).not.toContain('No top lists:');
  });

  it('reports the refusal and a non-zero exit in JSON', async () => {
    const byField = Object.fromEntries(
      Object.keys(defaultTopLists().byField).map(field => [
        field,
        { status: 429, retryAfter: 45 },
      ])
    );
    useFirewallActivity({ ...actionSeries(), byField });

    client.setArgv('firewall', 'traffic', 'list', '--json');
    expect(await firewall(client)).toEqual(1);

    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.topLists[0].unavailable).toEqual('rate-limit');
    expect(json.topLists[0].retrySeconds).toEqual(45);
    // The chart answered, so the payload is partial rather than empty.
    expect(json.stats).toBeDefined();
  });

  it('degrades one plan-gated panel without losing the report', async () => {
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        // One panel answering 402 does not mean the account cannot query
        // firewall traffic. Unknown Bot Traffic still reads request counts.
        botName: { status: 402 },
        requestHostname: {
          summary: [
            {
              requestHostname: 'example.com',
              [FIREWALL_ROLLUP_COLUMN]: 2_400,
            },
          ],
        },
      },
    });
    client.setArgv('firewall', 'traffic', 'list', '--dimension', 'bot,host');
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Needs Observability Plus.');
    // The panels that can answer still do, and so does the timeseries.
    expect(out).toContain('example.com');
    expect(out).toContain('Requests by Action');
  });

  it('keeps every other panel when several fail at once', async () => {
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        clientIp: { status: 500 },
        clientJa4Digest: { status: 500 },
        botName: { status: 402 },
        requestHostname: {
          summary: [
            {
              requestHostname: 'example.com',
              [FIREWALL_ROLLUP_COLUMN]: 2_400,
            },
          ],
        },
      },
    });
    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--dimension',
      'ip,ja4,bot,host'
    );
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('example.com');
    expect(out).toContain('Needs Observability Plus.');
    expect(out.match(/Couldn't load this table\./g)?.length).toEqual(2);
  });

  it('reports each panel failure separately in JSON', async () => {
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        clientIp: { status: 500 },
        botName: { status: 402 },
      },
    });
    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--dimension',
      'ip,bot',
      '--json'
    );
    // Both lists asked for failed, for different reasons — still no report.
    expect(await firewall(client)).toEqual(1);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(
      json.topLists.map((l: { dimension: string; unavailable?: string }) => [
        l.dimension,
        l.unavailable,
      ])
    ).toEqual([
      ['ip', 'error'],
      ['bot', 'plan'],
    ]);
  });

  it("relays the API's upgrade message, which names the plans", async () => {
    firewallActivity.queryStatus = 402;
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(1);
    const out = client.stderr.getFullOutput();
    // Flattening the 402 into a constant of our own dropped the team, the
    // plans that include the feature and the link to read about it.
    expect(out).toContain('Observability Plus is required');
    expect(out).not.toContain('Traffic and alerts need Observability Plus.');
    // And says how to get it: the CLI completes this purchase itself.
    expect(out).toContain('buy addon observability-plus');
  });

  it('does not sell a subscription when Observability Plus was disabled', async () => {
    firewallActivity.queryStatus = 402;
    firewallActivity.queryMessage =
      'Observability Plus was disabled for team acme. Re-enable it to run this query.';
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(1);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Re-enable it');
    expect(out).not.toContain('buy addon');
  });

  it('points an excluded project at enable, not a purchase', async () => {
    firewallActivity.queryStatus = 402;
    firewallActivity.queryMessage =
      'Observability Plus is enabled for team acme, but this project is excluded from it. Include the project in Observability Plus to query its data.';
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(1);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('project observability enable');
    expect(out).not.toContain('buy addon');
  });

  it('offers no purchase when the 402 named another product', async () => {
    firewallActivity.queryStatus = 402;
    firewallActivity.queryMessage =
      'Accessing Analytics custom events requires an Enterprise or Pro plan.';
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(1);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Enterprise or Pro plan');
    // Every paid product on this endpoint refuses with 402, so gating the
    // hint on the status would sell the wrong subscription.
    expect(out).not.toContain('buy addon');
  });

  it('offers no purchase for a spent query quota', async () => {
    firewallActivity.queryStatus = 402;
    firewallActivity.queryMessage = RATE_LIMIT_MESSAGE;
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(1);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('daily observability metrics query limit');
    // The team may already hold the subscription; a second one does not
    // raise the limit.
    expect(out).not.toContain('buy addon');
  });

  it('hands a Priority 402 to a person, not --yes', async () => {
    firewallActivity.queryStatus = 402;
    firewallActivity.queryMessage =
      'A Priority project is required for this query.';
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(1);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('A Priority project is required');
    expect(out).toContain('project priority enable');
    expect(out).not.toContain('A person must');
    expect(out).not.toContain('--yes');
    expect(out).not.toContain('buy addon');
  });

  it('uses a positional project in the Priority recovery command for agents', async () => {
    client.nonInteractive = true;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__exit__');
    }) as never);

    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--project',
      'firewall-test',
      '--non-interactive'
    );

    try {
      expect(() =>
        failFirewallObservabilityPlan(
          client,
          apiError('A Priority project is required for this query.'),
          'firewall-test'
        )
      ).toThrow('__exit__');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.next?.[0]?.command).toBe(
        'vercel project priority enable firewall-test'
      );
      expect(payload.next?.[0]?.command).not.toContain('--project');
      expect(payload.next?.[0]?.command).not.toContain('--non-interactive');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('uses a positional project in the Observability recovery command for agents', async () => {
    client.nonInteractive = true;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__exit__');
    }) as never);

    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--project',
      'firewall-test',
      '--non-interactive'
    );

    try {
      expect(() =>
        failFirewallObservabilityPlan(
          client,
          apiError(
            'Observability Plus is enabled for team acme, but this project is excluded from it. Include the project in Observability Plus to query its data.'
          ),
          'firewall-test'
        )
      ).toThrow('__exit__');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.next?.[0]?.command).toBe(
        'vercel project observability enable firewall-test'
      );
      expect(payload.next?.[0]?.command).not.toContain('--project');
      expect(payload.next?.[0]?.command).not.toContain('--non-interactive');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('does not pass --project to buy pro recovery for agents', async () => {
    client.nonInteractive = true;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__exit__');
    }) as never);

    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--project',
      'firewall-test',
      '--non-interactive'
    );

    try {
      expect(() =>
        failFirewallObservabilityPlan(
          client,
          apiError(
            'Observability Plus is available on Pro and Enterprise plans. Upgrade your plan to continue.'
          ),
          'firewall-test'
        )
      ).toThrow('__exit__');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.next?.[0]?.command).toBe(
        'vercel buy pro --non-interactive'
      );
      expect(payload.next?.[0]?.command).not.toContain('--project');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  describe('when the project belongs to a team other than the selected one', () => {
    // `requireProjectContext` sets `currentTeam` to the linked project's team
    // for this run. A recovery run on its own resolves the global team, so it
    // has to name this one.
    function linkedTeam(plan: string) {
      client.config.currentTeam = 'team_linked';
      teamCache.set('team_linked', {
        id: 'team_linked',
        slug: 'linked-team',
        billing: { plan },
      } as never);
    }

    function agentRecovery(message: string, argv: string[] = []) {
      client.nonInteractive = true;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('__exit__');
      }) as never);
      client.setArgv(
        'firewall',
        'traffic',
        'list',
        '--non-interactive',
        ...argv
      );
      try {
        expect(() =>
          failFirewallObservabilityPlan(
            client,
            apiError(message),
            'firewall-test'
          )
        ).toThrow('__exit__');
      } finally {
        exitSpy.mockRestore();
      }
      return JSON.parse(client.stdout.getFullOutput());
    }

    it('scopes the Priority enable command to the project team', () => {
      linkedTeam('pro');
      const payload = agentRecovery(
        'A Priority project is required for this query.'
      );
      expect(payload.next?.[0]?.command).toBe(
        'vercel project priority enable firewall-test --scope linked-team'
      );
      expect(payload.hint).toContain(
        'project priority enable firewall-test --scope linked-team'
      );
    });

    it('scopes buy pro to the project team on Hobby', () => {
      linkedTeam('hobby');
      const payload = agentRecovery(
        'Observability Plus is required for this query.'
      );
      expect(payload.next?.[0]?.command).toBe(
        'vercel buy pro --scope linked-team --non-interactive'
      );
      expect(payload.hint).toContain('buy pro --scope linked-team');
    });

    it('does not repeat a --scope or --team the user passed', () => {
      linkedTeam('pro');
      const payload = agentRecovery(
        'A Priority project is required for this query.',
        ['--team', 'linked-team']
      );
      const command: string = payload.next?.[0]?.command;
      expect(command.match(/--scope|--team/g)).toEqual(['--scope']);
    });
  });

  it('sends a Hobby Observability Plus 402 to buy pro, not Plus or Priority', async () => {
    teamCache.clear();
    setTeamBillingPlan('hobby');
    firewallActivity.queryStatus = 402;
    client.setArgv('firewall', 'traffic', 'list');
    expect(await firewall(client)).toEqual(1);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Observability Plus is required');
    expect(out).toContain('buy pro');
    expect(out).not.toContain('buy addon');
    expect(out).not.toContain('project priority enable');
  });

  it('emits JSON on stdout with nothing else', async () => {
    client.setArgv('firewall', 'traffic', 'list', '--json');
    expect(await firewall(client)).toEqual(0);

    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.period.granularity).toEqual({ hours: 1 });
    expect(json.stats).toEqual({ allow: 40_000, deny: 2_400 });
    expect(json.filter).toEqual(null);
    expect(json.series.map((s: { action: string }) => s.action)).toEqual([
      'allow',
      'deny',
    ]);
    const ips = json.topLists.find(
      (list: { dimension: string }) => list.dimension === 'ip'
    );
    expect(ips.rows).toEqual([
      { value: '1.2.3.4', total: 1_800 },
      { value: '5.6.7.8', total: 600 },
    ]);
    expect(client.stderr.getFullOutput()).not.toContain('Firewall traffic');
  });

  it('marks a failed list unavailable in JSON rather than empty', async () => {
    useFirewallActivity({
      ...actionSeries(),
      byField: {
        ...defaultTopLists().byField,
        clientIp: { status: 500 },
      },
    });
    client.setArgv('firewall', 'traffic', 'list', '--json');
    expect(await firewall(client)).toEqual(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    const ips = json.topLists.find(
      (list: { dimension: string }) => list.dimension === 'ip'
    );
    expect(ips).toEqual({ dimension: 'ip', rows: [], unavailable: 'error' });
  });

  describe('--alert', () => {
    const started = Date.UTC(2026, 8, 6, 9, 0, 0);
    const resolved = started + HOUR;

    beforeEach(() => {
      useFirewallActivity({
        ...actionSeries(),
        ...defaultTopLists(),
        alertGroups: {
          al_scope: {
            id: 'al_scope',
            title: 'DDoS Mitigation',
            type: 'firewallSystemRule_anomaly',
            alerts: [
              createO11yFirewallAlert({
                id: 'al_scope',
                startedAt: started,
                resolvedAt: resolved,
                ruleId: 'sys_dos_mitigation',
              }),
            ],
          },
        },
      });
    });

    it('scopes the window and rule to the alert', async () => {
      client.setArgv(
        'firewall',
        'traffic',
        'list',
        '--alert',
        'al_scope',
        '--dimension',
        'ip'
      );
      expect(await firewall(client)).toEqual(0);

      const top = firewallActivity.queries.find(q =>
        (q.groupBy ?? []).includes('clientIp')
      );
      expect(top?.startTime).toEqual(new Date(started).toISOString());
      expect(top?.endTime).toEqual(new Date(resolved).toISOString());
      expect(top?.filter).toContain('wafRuleId:"sys_dos_mitigation"');
    });

    it('lets --since widen the alert window', async () => {
      client.setArgv(
        'firewall',
        'traffic',
        'list',
        '--alert',
        'al_scope',
        '--since',
        '2026-09-06T00:00:00.000Z',
        '--until',
        '2026-09-06T12:00:00.000Z',
        '--dimension',
        'ip'
      );
      expect(await firewall(client)).toEqual(0);

      const top = firewallActivity.queries.find(q =>
        (q.groupBy ?? []).includes('clientIp')
      );
      expect(top?.startTime).toEqual('2026-09-06T00:00:00.000Z');
      expect(top?.filter).toContain('wafRuleId:"sys_dos_mitigation"');
    });

    it('rejects an --until that falls before the alert began', async () => {
      client.setArgv(
        'firewall',
        'traffic',
        'list',
        '--alert',
        'al_scope',
        '--until',
        '2026-09-06T08:00:00.000Z'
      );
      expect(await firewall(client)).toEqual(2);
      // Without `--since` the start comes from the alert, so the pair the
      // caller passed is not the pair that has to be ordered.
      expect(client.stderr.getFullOutput()).toContain(
        'The alert began after `--until`'
      );
      expect(firewallActivity.queries).toEqual([]);
    });

    it('fails on an alert id that resolves to nothing', async () => {
      client.setArgv('firewall', 'traffic', 'list', '--alert', 'al_missing');
      expect(await firewall(client)).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'No firewall alert found for "al_missing"'
      );
      expect(firewallActivity.queries).toEqual([]);
    });
  });
});

describe('firewall traffic list renamed options', () => {
  // Runs the command with a fresh client and a fixed window, recording its
  // queries.
  async function run(...args: string[]) {
    client.reset();
    useUser({ id: 'user_1', username: 'tester' });
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'firewall-test-project',
      name: 'firewall-test',
    });
    client.cwd = setupUnitFixture('commands/firewall');
    useFirewallActivity({ ...actionSeries(), ...defaultTopLists() });
    client.setArgv(
      'firewall',
      'traffic',
      'list',
      '--dimension',
      'ip',
      '--since',
      '2026-09-06T12:00:00Z',
      '--until',
      '2026-09-06T14:00:00Z',
      ...args
    );
    const exitCode = await firewall(client);
    return {
      exitCode,
      queries: firewallActivity.queries.map(
        ({ filter, rowLimit, seriesLimit }) => ({
          filter,
          rowLimit,
          seriesLimit,
        })
      ),
      stdout: client.stdout.getFullOutput(),
      stderr: client.stderr.getFullOutput(),
    };
  }

  it.each([
    [
      '--filter',
      ['--filter', 'requestPath!="/health"'],
      ['--query', 'requestPath!="/health"'],
    ],
    ['--top', ['--top', '3'], ['--limit', '3']],
  ])('still accepts %s, with one warning', async (typed, oldArgs, newArgs) => {
    const now = await run(...newArgs);
    const before = await run(...oldArgs);
    const name = newArgs[0];

    expect(now.exitCode).toBe(0);
    expect(now.stderr).not.toContain('deprecated');
    expect(before.exitCode).toBe(now.exitCode);
    expect(before.queries).toEqual(now.queries);
    expect(before.stdout).toBe(now.stdout);
    expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
    expect(before.stderr).toContain(`! ${typed} is deprecated. Use ${name}.\n`);

    const nowJson = await run(...newArgs, '--json');
    const beforeJson = await run(...oldArgs, '--json');
    expect(beforeJson.exitCode).toBe(0);
    expectDeprecationInJson(
      beforeJson.stdout,
      nowJson.stdout,
      `${typed} is deprecated. Use ${name}.`
    );
    expect(beforeJson.stderr).not.toContain('deprecated');
  });

  it('sends --query expressions in the filter', async () => {
    const result = await run('--query', 'requestPath!="/health"');

    expect(
      result.queries.some(q => q.filter?.includes('requestPath!="/health"'))
    ).toBe(true);
  });

  it.each([
    [['--query', 'a:1', '--filter', 'b:2'], "Can't use --query with --filter."],
    [['--limit', '3', '--top', '3'], "Can't use --limit with --top."],
  ])('rejects %j before any query', async (args, message) => {
    const result = await run(...args);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(message);
    expect(result.queries).toEqual([]);
  });
});
