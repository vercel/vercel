import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useFirewallActivity,
  firewallActivity,
  FIREWALL_ROLLUP_COLUMN,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { expectDeprecationInJson } from '../../../helpers/deprecation-warning';

const IP = '1.2.3.4';
const BUCKET = Date.UTC(2026, 8, 6, 12, 0, 0);
const NEXT_BUCKET = BUCKET + 900_000;

const IP_DETAIL_KEY = 'asnName,asnId,clientIpCountry';

function activity() {
  return {
    series: [
      {
        timestamp: new Date(BUCKET).toISOString(),
        wafAction: 'deny',
        value: 900,
      },
      {
        timestamp: new Date(NEXT_BUCKET).toISOString(),
        wafAction: 'deny',
        value: 1_500,
      },
    ],
    actionSummary: [{ wafAction: 'deny', [FIREWALL_ROLLUP_COLUMN]: 2_400 }],
    byField: {
      [IP_DETAIL_KEY]: {
        summary: [
          {
            asnName: 'EXAMPLE-AS',
            asnId: '64500',
            clientIpCountry: 'DE',
            [FIREWALL_ROLLUP_COLUMN]: 2_400,
          },
        ],
      },
      requestPath: {
        summary: [
          { requestPath: '/api/login', [FIREWALL_ROLLUP_COLUMN]: 2_000 },
          { requestPath: '', [FIREWALL_ROLLUP_COLUMN]: 400 },
        ],
        data: [
          {
            timestamp: new Date(BUCKET).toISOString(),
            requestPath: '/api/login',
            [FIREWALL_ROLLUP_COLUMN]: 800,
          },
          {
            timestamp: new Date(NEXT_BUCKET).toISOString(),
            requestPath: '/api/login',
            [FIREWALL_ROLLUP_COLUMN]: 1_200,
          },
          {
            timestamp: new Date(BUCKET).toISOString(),
            requestPath: '',
            [FIREWALL_ROLLUP_COLUMN]: 400,
          },
        ],
      },
    },
  };
}

describe('firewall traffic inspect', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'firewall-test-project',
      name: 'firewall-test',
    });
    client.cwd = setupUnitFixture('commands/firewall');
    useFirewallActivity(activity());
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'traffic', 'inspect', '--help');
      expect(await firewall(client)).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:traffic', value: 'traffic' },
        { key: 'flag:help', value: 'firewall:traffic:inspect' },
      ]);
    });
  });

  it('asks for an approximate ranking only where the set is unbounded', async () => {
    client.setArgv('firewall', 'traffic', 'inspect', 'ip', '1.2.3.4');
    expect(await firewall(client)).toEqual(0);

    // The breakdown is `--top` rows out of a dimension with no bound, which
    // is the shape the API can serve from a sampled read — and the shape
    // that is otherwise expensive enough to be refused or to time out.
    const breakdown = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('requestPath')
    );
    expect(breakdown?.body?.seriesSelection?.mode).toEqual('approximate');

    // The action chart is not a top-N: `wafAction` has a handful of values
    // and the cap sits far above them, so approximating buys nothing and
    // would put the report's headline totals on estimates.
    const actions = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('wafAction')
    );
    expect(actions?.body?.seriesSelection?.mode).toEqual('exact');
  });

  it('requires a dimension and a value', async () => {
    client.setArgv('firewall', 'traffic', 'inspect', 'ip');
    expect(await firewall(client)).toEqual(2);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Dimension and value are required');
    expect(out).toContain('user-agent');
    expect(firewallActivity.queries).toEqual([]);
  });

  it('rejects an unknown dimension', async () => {
    client.setArgv('firewall', 'traffic', 'inspect', 'browser', 'chrome');
    expect(await firewall(client)).toEqual(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Unknown dimension "browser"'
    );
  });

  it('rejects an unknown --group-by', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'ip',
      IP,
      '--group-by',
      'browser'
    );
    expect(await firewall(client)).toEqual(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Unknown --group-by "browser"'
    );
  });

  it('rejects grouping a dimension by itself', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'ip',
      IP,
      '--group-by',
      'ip'
    );
    expect(await firewall(client)).toEqual(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--group-by` must name a different dimension from "ip"'
    );
  });

  it('reports the entity, its actions, and its breakdown', async () => {
    client.setArgv('firewall', 'traffic', 'inspect', 'ip', IP);
    expect(await firewall(client)).toEqual(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain(IP);
    expect(out).toContain('IP Address');
    expect(out).toContain('AS Name');
    expect(out).toContain('EXAMPLE-AS');
    expect(out).toContain('AS Number');
    expect(out).toContain('Country');
    expect(out).toContain('Requests');
    expect(out).toContain('2.4k');
    expect(out).toContain('Requests by Action');
    expect(out).toContain('Deny');
    expect(out).toContain('Breakdown by Request Path');
    expect(out).toContain('/api/login');
    // A path the rows leave empty is still traffic, so it is named.
    expect(out).toContain('(not set)');
  });

  it('filters every query to the inspected value', async () => {
    client.setArgv('firewall', 'traffic', 'inspect', 'ip', IP);
    expect(await firewall(client)).toEqual(0);

    expect(firewallActivity.queries).toHaveLength(3);
    for (const query of firewallActivity.queries) {
      expect(query.filter).toContain(`clientIp:"${IP}"`);
    }
    const breakdown = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('requestPath')
    );
    // Not the exclusion the top list uses: an empty path is a real row here.
    expect(breakdown?.filter).not.toContain('requestPath!=""');
  });

  it('narrows the inspected value further with a dimension flag', async () => {
    // The dimension flags are `list`'s, and `buildTrafficFilter` reads them on
    // both paths: leaving them off this subcommand's options rejected them as
    // unknown rather than ANDing them with the value.
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'ip',
      IP,
      '--action',
      'deny'
    );
    expect(await firewall(client)).toEqual(0);

    expect(firewallActivity.queries.length).toBeGreaterThan(0);
    for (const query of firewallActivity.queries) {
      expect(query.filter).toContain(`clientIp:"${IP}"`);
      expect(query.filter).toContain('wafAction:"deny"');
    }
  });

  it('rejects WAF action filters on request-count dimensions', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'unknown-bot',
      'ai_scraper',
      '--action',
      'deny'
    );
    expect(await firewall(client)).toEqual(2);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('request-count data');
    expect(out).toContain('--action');
    expect(firewallActivity.queries).toEqual([]);
  });

  it('rejects a request-count filter on a firewall-action inspect', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'ip',
      IP,
      '--unknown-bot',
      'ai_scraper'
    );
    expect(await firewall(client)).toEqual(2);

    const out = client.stderr.getFullOutput();
    expect(out).toContain("Can't combine --unknown-bot");
    expect(out).toContain('Inspect unknown-bot');
    expect(firewallActivity.queries).toEqual([]);
  });

  it('rejects WAF rule breakdowns on request-count dimensions', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'unknown-bot',
      'ai_scraper',
      '--group-by',
      'rule'
    );
    expect(await firewall(client)).toEqual(2);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('request-count data');
    expect(out).toContain('--group-by rule');
    expect(firewallActivity.queries).toEqual([]);
  });

  it('rejects rule-scoped alerts on request-count dimensions', async () => {
    useFirewallActivity({
      ...activity(),
      alertGroups: {
        al_request_count_incompatible: {
          id: 'al_request_count_incompatible',
          title: 'Custom rule spike',
          type: 'firewallCustomRule_anomaly',
          recordedStartedAt: BUCKET,
          recordedResolvedAt: NEXT_BUCKET,
          alerts: [
            {
              id: 'al_request_count_incompatible',
              title: 'Custom rule spike',
              type: 'firewallCustomRule_anomaly',
              startedAt: BUCKET,
              resolvedAt: NEXT_BUCKET,
              data: { count: 10, action: 'deny', ruleId: 'rule_001' },
            },
          ],
        },
      },
    });
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'unknown-bot',
      'ai_scraper',
      '--alert',
      'al_request_count_incompatible'
    );
    expect(await firewall(client)).toEqual(2);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('request-count data');
    expect(out).toContain('firewall alert');
    expect(firewallActivity.groupRequests).toEqual([
      'al_request_count_incompatible',
    ]);
    expect(firewallActivity.queries).toEqual([]);
  });

  it('escapes a quote in the inspected value', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'user-agent',
      "o'brien/1.0",
      '--group-by',
      'path'
    );
    expect(await firewall(client)).toEqual(0);
    const breakdown = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('requestPath')
    );
    expect(breakdown?.filter).toContain('clientUserAgent:"o\'brien/1.0"');
  });

  it('offers the block and regroup follow-ups for an IP', async () => {
    client.setArgv('firewall', 'traffic', 'inspect', 'ip', IP);
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Next steps:');
    expect(out).toContain('vercel firewall ip-blocks block <ip>');
    expect(out).toContain('--group-by');
    // The value came from a request, so it never lands in a pasteable command.
    expect(out).not.toContain(`ip-blocks block ${IP}`);
  });

  it('offers the rule editor when inspecting a rule', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'rule',
      'rule_abc123',
      '--group-by',
      'path'
    );
    expect(await firewall(client)).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      'vercel firewall rules update <rule>'
    );
  });

  it('keeps the report when the header detail query fails', async () => {
    useFirewallActivity({
      ...activity(),
      byField: {
        ...activity().byField,
        // The IP's network and country. Decoration, not the report.
        [IP_DETAIL_KEY]: { status: 500 },
      },
    });
    client.setArgv('firewall', 'traffic', 'inspect', 'ip', IP);
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Requests by Action');
    expect(out).toContain('Breakdown by Request Path');
    expect(out).not.toContain('AS Name');
  });

  it('treats a value with no traffic as not found', async () => {
    useFirewallActivity({
      byField: { [IP_DETAIL_KEY]: { summary: [] }, requestPath: {} },
    });
    client.setArgv('firewall', 'traffic', 'inspect', 'ip', '9.9.9.9');
    expect(await firewall(client)).toEqual(1);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('No firewall traffic for IP Address "9.9.9.9"');
    expect(out).toContain('firewall traffic list');
  });

  it('passes --top as the breakdown limit', async () => {
    client.setArgv('firewall', 'traffic', 'inspect', 'ip', IP, '--top', '3');
    expect(await firewall(client)).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('(top 3)');
  });

  it('rejects a --top outside the supported range', async () => {
    client.setArgv('firewall', 'traffic', 'inspect', 'ip', IP, '--top', '0');
    expect(await firewall(client)).toEqual(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--limit` must be an integer between 1 and 100'
    );
  });

  it("relays the API's upgrade message when observability is gated", async () => {
    firewallActivity.queryStatus = 402;
    client.setArgv('firewall', 'traffic', 'inspect', 'ip', IP);
    expect(await firewall(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Observability Plus is required'
    );
    // An error naming what is missing and not how to get it leaves the
    // reader nowhere. The CLI can complete this purchase itself.
    expect(client.stderr.getFullOutput()).toContain(
      'buy addon observability-plus'
    );
  });

  it('emits JSON on stdout with nothing else', async () => {
    client.setArgv('firewall', 'traffic', 'inspect', 'ip', IP, '--json');
    expect(await firewall(client)).toEqual(0);

    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.dimension).toEqual('ip');
    expect(json.value).toEqual(IP);
    expect(json.total).toEqual(2_400);
    expect(json.stats).toEqual({ deny: 2_400 });
    expect(json.detail).toEqual({
      asnName: 'EXAMPLE-AS',
      asnId: '64500',
      clientIpCountry: 'DE',
    });
    expect(json.filter).toContain(`clientIp:"${IP}"`);
    expect(json.breakdown.groupBy).toEqual('path');
    expect(json.breakdown.groups).toEqual([
      { value: '/api/login', total: 2_000, series: [800, 1_200] },
      { value: '', total: 400, series: [400, 0] },
    ]);
    expect(client.stderr.getFullOutput()).not.toContain('Breakdown by');
  });

  it('reads unknown bot categories off request counts', async () => {
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'unknown-bot',
      'ai_scraper'
    );
    expect(await firewall(client)).toEqual(0);

    const requestQueries = firewallActivity.queries.filter(
      q => q.metric === 'vercel.request.count'
    );
    expect(requestQueries.length).toBeGreaterThan(0);
    expect(
      requestQueries.every(q => q.filter?.includes('botCategory:"ai_scraper"'))
    ).toBe(true);
    expect(
      requestQueries.every(q => q.filter?.includes('botVerified!="pass"'))
    ).toBe(true);
    expect(
      firewallActivity.queries.some(
        q => q.metric === 'vercel.firewall_action.count'
      )
    ).toBe(false);
  });
});

describe('firewall traffic inspect renamed options', () => {
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
    useFirewallActivity(activity());
    client.setArgv(
      'firewall',
      'traffic',
      'inspect',
      'ip',
      IP,
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
