import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  getMitigationsStatus,
  formatMitigationsStatus,
} from '../../../../src/util/firewall/format';
import type { BypassRule } from '../../../../src/util/firewall/types';

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
