import { describe, expect, it } from 'vitest';
import {
  clampPersistentActionWindow,
  PERSISTENT_ACTION_RETENTION_MS,
} from '../../../../src/util/firewall/get-firewall-events';

const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

describe('clampPersistentActionWindow', () => {
  it('leaves a window the plan covers in full alone', () => {
    const window = clampPersistentActionWindow({
      from: new Date(NOW - DAY),
      to: new Date(NOW),
      isEnterprise: false,
      now: NOW,
    });
    expect(window.requestedFrom).toBeUndefined();
    expect(window.empty).toBe(false);
    expect(window.from.getTime()).toEqual(NOW - DAY);
  });

  it('measures the boundary from the clock the window was built on', () => {
    // A relative `--since 24h` is resolved while the flags are parsed; the
    // plan lookup and any project prompt then run before this is reached.
    // Reading `Date.now()` here would find that start older than a 24-hour
    // retention by exactly that delay, and report every default window as
    // trimmed by a few milliseconds.
    const parsedAt = NOW;
    const window = clampPersistentActionWindow({
      from: new Date(parsedAt - DAY),
      to: new Date(parsedAt),
      isEnterprise: false,
      now: parsedAt,
    });
    expect(window.requestedFrom).toBeUndefined();
  });

  it('trims a start older than the plan keeps, and says what was asked for', () => {
    const requestedFrom = NOW - 3 * DAY;
    const window = clampPersistentActionWindow({
      from: new Date(requestedFrom),
      to: new Date(NOW),
      isEnterprise: false,
      now: NOW,
    });
    expect(window.requestedFrom?.getTime()).toEqual(requestedFrom);
    expect(window.from.getTime()).toEqual(
      NOW - PERSISTENT_ACTION_RETENTION_MS.other
    );
    expect(window.empty).toBe(false);
  });

  it('keeps a week for an enterprise plan', () => {
    const window = clampPersistentActionWindow({
      from: new Date(NOW - 3 * DAY),
      to: new Date(NOW),
      isEnterprise: true,
      now: NOW,
    });
    expect(window.requestedFrom).toBeUndefined();
  });

  it('reports a window entirely older than the retention as empty', () => {
    const window = clampPersistentActionWindow({
      from: new Date(NOW - 5 * DAY),
      to: new Date(NOW - 3 * DAY),
      isEnterprise: false,
      now: NOW,
    });
    expect(window.empty).toBe(true);
  });

  it('does not clamp on a plan it could not read', () => {
    // `fetchPlanInfo` answers non-enterprise when the lookup fails, so
    // clamping on it would trim an enterprise team's week to a day and name a
    // retention limit that does not apply. The API enforces its own either
    // way, which costs a silent trim rather than a wrong explanation.
    const window = clampPersistentActionWindow({
      from: new Date(NOW - 5 * DAY),
      to: new Date(NOW - 3 * DAY),
      isEnterprise: false,
      planKnown: false,
      now: NOW,
    });
    expect(window.empty).toBe(false);
    expect(window.requestedFrom).toBeUndefined();
    expect(window.from.getTime()).toEqual(NOW - 5 * DAY);
  });
});
