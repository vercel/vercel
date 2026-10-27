import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  getMitigationsStatus,
  formatMitigationsStatus,
  formatBotProtectionStatus,
  formatRulesTable,
  formatRuleExpanded,
  formatRuleDetail,
} from '../../../../src/util/firewall/format';
import type {
  BypassRule,
  FirewallRule,
  ManagedRuleAction,
} from '../../../../src/util/firewall/types';
import stripAnsi from 'strip-ansi';

const NOW = 1_700_000_000_000;
/** Epoch seconds, two hours after NOW. */
const FUTURE = NOW / 1000 + 2 * 60 * 60;
/** Epoch seconds, one hour before NOW. */
const PAST = NOW / 1000 - 60 * 60;

describe('getMitigationsStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports active when the project has no bypass IPs', () => {
    expect(getMitigationsStatus(undefined)).toEqual({ paused: false });
    expect(getMitigationsStatus([])).toEqual({ paused: false });
  });

  it('ignores bypasses that are not all-sources', () => {
    expect(getMitigationsStatus([`1.2.3.0/24#${FUTURE}`, '10.0.0.1'])).toEqual({
      paused: false,
    });
  });

  it('reports paused for an unexpired all-sources bypass', () => {
    expect(getMitigationsStatus([`0.0.0.0/0#${FUTURE}`])).toEqual({
      paused: true,
      resumesAt: FUTURE,
    });
  });

  it('reports paused for an unexpired IPv6 all-sources bypass', () => {
    expect(getMitigationsStatus([`::/0#${FUTURE}`])).toEqual({
      paused: true,
      resumesAt: FUTURE,
    });
  });

  it('handles the IPv4 and IPv6 pair written by a pause', () => {
    // Pausing mitigations writes both address families with one deadline.
    expect(
      getMitigationsStatus([`0.0.0.0/0#${FUTURE}`, `::/0#${FUTURE}`])
    ).toEqual({ paused: true, resumesAt: FUTURE });
  });

  it('reports active once the bypass has expired', () => {
    expect(getMitigationsStatus([`0.0.0.0/0#${PAST}`])).toEqual({
      paused: false,
    });
  });

  it('reports paused with no resume time for a permanent bypass', () => {
    expect(getMitigationsStatus(['0.0.0.0/0'])).toEqual({ paused: true });
  });

  it('prefers a permanent bypass over an expiring one', () => {
    expect(getMitigationsStatus([`0.0.0.0/0#${FUTURE}`, '::/0'])).toEqual({
      paused: true,
    });
  });

  describe('when an expiry cannot be interpreted', () => {
    // The entry still proves a bypass exists, so it must not be discarded:
    // reporting mitigations as active is the more dangerous reading.
    it('reports paused for a non-numeric suffix', () => {
      expect(getMitigationsStatus(['0.0.0.0/0#not-a-number'])).toEqual({
        paused: true,
      });
    });

    it('reports paused for a partially numeric suffix', () => {
      // `parseInt` would read this as 12 and treat the bypass as expired.
      expect(getMitigationsStatus(['0.0.0.0/0#12abc'])).toEqual({
        paused: true,
      });
    });

    it('reports paused for a suffix that looks like a rule id', () => {
      expect(getMitigationsStatus([`0.0.0.0/0#rule_abc123`])).toEqual({
        paused: true,
      });
    });

    it('reports paused for an empty suffix', () => {
      expect(getMitigationsStatus(['0.0.0.0/0#'])).toEqual({ paused: true });
    });

    it('reports paused for a millisecond timestamp', () => {
      // Read as seconds this would be a date ~50,000 years out.
      expect(getMitigationsStatus([`0.0.0.0/0#${NOW}`])).toEqual({
        paused: true,
      });
    });
  });

  describe('with bypass rules also available', () => {
    const allSourcesRule = (
      overrides: Partial<BypassRule> = {}
    ): BypassRule => ({
      OwnerId: 'team_dummy',
      Id: 'bypass_all',
      Ip: '0.0.0.0/0',
      Domain: '*',
      ProjectId: 'firewall-test-project',
      ...overrides,
    });

    it('reports paused from the bypass rules when the project has no entry', () => {
      // Guards against a bypass that was never mirrored onto the project.
      expect(
        getMitigationsStatus([], [allSourcesRule({ ExpiresAt: FUTURE })])
      ).toEqual({ paused: true, resumesAt: FUTURE });
    });

    it('reports paused from the project when the bypass rules have no entry', () => {
      expect(getMitigationsStatus([`0.0.0.0/0#${FUTURE}`], [])).toEqual({
        paused: true,
        resumesAt: FUTURE,
      });
    });

    it('treats a bypass rule with no expiry as permanently paused', () => {
      expect(getMitigationsStatus([], [allSourcesRule()])).toEqual({
        paused: true,
      });
    });

    it('ignores a domain-scoped all-sources rule', () => {
      expect(
        getMitigationsStatus(
          [],
          [allSourcesRule({ Domain: 'example.com', ExpiresAt: FUTURE })]
        )
      ).toEqual({ paused: false });
    });

    it('ignores an expired bypass rule', () => {
      expect(
        getMitigationsStatus([], [allSourcesRule({ ExpiresAt: PAST })])
      ).toEqual({ paused: false });
    });

    it('keeps the later resume time when the sources disagree', () => {
      const later = FUTURE + 60 * 60;
      expect(
        getMitigationsStatus(
          [`0.0.0.0/0#${FUTURE}`],
          [allSourcesRule({ ExpiresAt: later })]
        )
      ).toEqual({ paused: true, resumesAt: later });
    });

    it('prefers a permanent bypass over an expiring one', () => {
      expect(
        getMitigationsStatus([`0.0.0.0/0#${FUTURE}`], [allSourcesRule()])
      ).toEqual({ paused: true });
    });
  });
});

describe('formatMitigationsStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders active', () => {
    expect(formatMitigationsStatus({ paused: false })).toContain('Active');
  });

  it('renders the remaining time until mitigations resume', () => {
    const output = formatMitigationsStatus({
      paused: true,
      resumesAt: FUTURE,
    });
    expect(output).toContain('Paused (auto-resumes in 2h 0m)');
  });

  it('renders a bare paused state for a permanent bypass', () => {
    const output = formatMitigationsStatus({ paused: true });
    expect(output).toContain('Paused');
    expect(output).not.toContain('auto-resumes');
  });

  it('renders a bare paused state once the resume time has passed', () => {
    const output = formatMitigationsStatus({ paused: true, resumesAt: PAST });
    expect(output).toContain('Paused');
    expect(output).not.toContain('auto-resumes');
  });
});

describe('formatBotProtectionStatus', () => {
  /** Strip colour so an assertion reads the label, not the escape codes. */
  const label = (action?: ManagedRuleAction, active = true) =>
    formatBotProtectionStatus({ active, action }).replace(
      // eslint-disable-next-line no-control-regex
      /\u001b\[[0-9;]*m/g,
      ''
    );

  it('names each action the API can send', () => {
    expect(label('log')).toEqual('Log');
    expect(label('challenge')).toEqual('Challenge');
    // Reporting a blocking ruleset as merely challenging understates it, and
    // disagrees with the `action` `--json` emits for the same config.
    expect(label('deny')).toEqual('Deny');
  });

  it('falls back to challenge when the ruleset carries no action', () => {
    expect(label(undefined)).toEqual('Challenge');
  });

  it('reads as off when inactive, whatever the action', () => {
    expect(label('deny', false)).toEqual('Off');
    expect(formatBotProtectionStatus(undefined)).toContain('Off');
  });
});

describe('formatRulesTable', () => {
  function rule(overrides: Partial<FirewallRule> = {}): FirewallRule {
    return {
      id: 'rule_001',
      name: 'Block bots',
      active: true,
      conditionGroup: [],
      action: { mitigate: { action: 'deny' } },
      ...overrides,
    };
  }

  it('keeps Status on the name line when another rule has a long redirect', () => {
    const longUrl = `https://example.com/${'a'.repeat(180)}`;
    const rendered = formatRulesTable(
      [
        {
          rule: rule({ name: 'Temp block /api/marketplace/logs' }),
          status: 'live',
        },
        {
          rule: rule({
            id: 'rule_redirect',
            name: 'Legacy docs',
            action: {
              mitigate: {
                action: 'redirect',
                redirect: { location: longUrl, permanent: true },
              },
            },
          }),
          status: 'live',
        },
      ],
      80
    );

    expect(rendered).not.toContain(longUrl);
    expect(rendered).toContain('Redirect (301)');

    const header = stripAnsi(rendered).split('\n')[0];
    const firstRow = stripAnsi(rendered).split('\n')[1];
    expect(header).toMatch(/#\s+Name\s+Action\s+Status/);
    expect(firstRow).toMatch(
      /1\s+Temp block \/api\/marketplace\/logs\s+Deny\s+Enabled/
    );
    expect(firstRow.length).toBeLessThanOrEqual(80);
  });

  it('truncates a long name rather than wrapping Status', () => {
    const rendered = formatRulesTable(
      [
        {
          rule: rule({
            name: 'A very long custom firewall rule name that would overflow a typical terminal',
          }),
          status: 'live',
        },
      ],
      60
    );
    const firstRow = stripAnsi(rendered).split('\n')[1];
    expect(firstRow).toContain('…');
    expect(firstRow).toContain('Enabled');
    expect(firstRow.length).toBeLessThanOrEqual(60);
  });
});

describe('formatRuleExpanded', () => {
  it('does not repeat the redirect destination on Action', () => {
    const rendered = stripAnsi(
      formatRuleExpanded({
        id: 'rule_redirect',
        name: 'Redirect inference to token theft page',
        active: true,
        description:
          'Redirect requests to /protecting-against-inference-theft to /protecting-against-token-theft',
        conditionGroup: [
          {
            conditions: [
              {
                type: 'path',
                op: 'eq',
                value: '/blog/protecting-against-inference-theft',
              },
            ],
          },
        ],
        action: {
          mitigate: {
            action: 'redirect',
            redirect: {
              location: '/blog/protecting-against-token-theft',
              permanent: false,
            },
          },
        },
      })
    );

    expect(rendered).toMatch(/Action:\s+Redirect$/m);
    expect(rendered).toContain(
      'Redirect: /blog/protecting-against-token-theft (307 temporary)'
    );
    expect(rendered).not.toContain('Redirect →');
  });
});

describe('formatRuleDetail', () => {
  it('does not repeat the redirect destination on Action', () => {
    const rendered = stripAnsi(
      formatRuleDetail({
        id: 'rule_redirect',
        name: 'Redirect Old Path',
        active: true,
        conditionGroup: [],
        action: {
          mitigate: {
            action: 'redirect',
            redirect: { location: '/new', permanent: true },
          },
        },
      })
    );

    expect(rendered).toMatch(/Action:\s+Redirect$/m);
    expect(rendered).toContain('Location:');
    expect(rendered).toContain('/new');
    expect(rendered).not.toContain('Redirect →');
  });
});
