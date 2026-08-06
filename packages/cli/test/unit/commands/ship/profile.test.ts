import { describe, expect, it } from 'vitest';
import { readJSONSync } from 'fs-extra';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import {
  formatDuration,
  ShipProfile,
  TOOL_SPAN_PREFIX,
} from '../../../../src/commands/ship/profile';

/** Read back what a profile wrote, which is the contract callers depend on. */
function writeAndRead(profile: ShipProfile) {
  const dir = setupTmpDir();
  return profile
    .write(dir, '2026-01-01T00-00-00-000Z.json')
    .then(path => ({ path, report: readJSONSync(path as string) }));
}

describe('ship profile', () => {
  describe('formatDuration', () => {
    it('shows sub-minute durations in seconds', () => {
      expect(formatDuration(400)).toBe('0.4s');
      expect(formatDuration(12_000)).toBe('12.0s');
    });

    it('shows longer durations in minutes and seconds', () => {
      expect(formatDuration(252_000)).toBe('4m 12s');
      expect(formatDuration(3_600_000)).toBe('60m 00s');
    });
  });

  describe('spans', () => {
    it('nests a span inside the one that is open', async () => {
      const profile = new ShipProfile();
      const endOuter = profile.start('session');
      const endInner = profile.start('start agent session');
      endInner();
      endOuter();

      const { report } = await writeAndRead(profile);

      expect(report.spans).toHaveLength(1);
      expect(report.spans[0].name).toBe('session');
      expect(report.spans[0].children[0].name).toBe('start agent session');
    });

    it('keeps sequential spans as siblings', async () => {
      const profile = new ShipProfile();
      profile.start('preflight')();
      profile.start('session')();

      const { report } = await writeAndRead(profile);

      expect(report.spans.map((s: { name: string }) => s.name)).toEqual([
        'preflight',
        'session',
      ]);
    });

    it('records overlapping work without disturbing the tree', async () => {
      const profile = new ShipProfile();
      const endTurn = profile.start('turn 1');
      // Two tools running at once, which a stack of open spans cannot express.
      profile.record(`${TOOL_SPAN_PREFIX}bash`, performance.now(), 1200);
      profile.record(`${TOOL_SPAN_PREFIX}read`, performance.now(), 30);
      endTurn();
      profile.start('stop agent session')();

      const { report } = await writeAndRead(profile);

      expect(report.spans).toHaveLength(2);
      expect(
        report.spans[0].children.map((s: { name: string }) => s.name)
      ).toEqual([`${TOOL_SPAN_PREFIX}bash`, `${TOOL_SPAN_PREFIX}read`]);
      expect(report.spans[0].children[0].durationMs).toBe(1200);
    });

    it('is unaffected by closing a span twice', async () => {
      const profile = new ShipProfile();
      const end = profile.start('session');
      const first = end();
      const second = end();

      expect(second).toBe(first);
      const { report } = await writeAndRead(profile);
      expect(report.spans).toHaveLength(1);
    });

    it('gives a span left open its elapsed time, flagged as unfinished', async () => {
      // What an interrupted run looks like. Reporting these as zero would say
      // the session took no time, which is the opposite of the truth.
      const profile = new ShipProfile();
      profile.start('session');
      profile.start('turn 1');

      const { report } = await writeAndRead(profile);

      const session = report.spans[0];
      expect(session.detail).toEqual({ unfinished: true });
      expect(session.durationMs).toBeGreaterThanOrEqual(0);
      expect(session.children[0].detail).toEqual({ unfinished: true });
      expect(session.durationMs).toBeLessThanOrEqual(report.totalMs);
    });

    it('leaves a finished span alone when others are still open', async () => {
      const profile = new ShipProfile();
      profile.start('session');
      profile.start('load runtime')({ ok: true });

      const { report } = await writeAndRead(profile);

      expect(report.spans[0].children[0].detail).toEqual({ ok: true });
    });

    it('attaches detail supplied at either end of a span', async () => {
      const profile = new ShipProfile();
      const end = profile.start('install harness packages', { attempt: 1 });
      end({ origin: 'local' });

      const { report } = await writeAndRead(profile);

      expect(report.spans[0].detail).toEqual({ attempt: 1, origin: 'local' });
    });
  });

  describe('the written report', () => {
    it('carries the metadata and a total', async () => {
      const profile = new ShipProfile();
      profile.set('harness', 'claude-code');
      profile.set('runtimeOrigin', 'local');
      // Undefined values are dropped rather than written as nulls.
      profile.set('harnessVersion', undefined);
      profile.start('session')();

      const { path, report } = await writeAndRead(profile);

      expect(path).toContain('2026-01-01T00-00-00-000Z.json');
      expect(report.harness).toBe('claude-code');
      expect(report.runtimeOrigin).toBe('local');
      expect(report).not.toHaveProperty('harnessVersion');
      expect(report.totalMs).toBeGreaterThanOrEqual(0);
      expect(Date.parse(report.startedAt)).not.toBeNaN();
      expect(Date.parse(report.finishedAt)).not.toBeNaN();
    });

    it('does not throw when the destination cannot be written', async () => {
      const profile = new ShipProfile();
      profile.start('session')();

      await expect(
        profile.write('/proc/nonexistent/profiles', 'run.json')
      ).resolves.toBeUndefined();
    });

    it('keeps only the most recent profiles', async () => {
      const dir = setupTmpDir();

      // One more than the cap, oldest first by name.
      for (let i = 0; i <= 20; i++) {
        const profile = new ShipProfile();
        profile.start('session')();
        await profile.write(
          dir,
          `2026-01-01T00-00-${String(i).padStart(2, '0')}.json`
        );
      }

      const { readdirSync } = await import('fs-extra');
      const remaining = readdirSync(dir).sort();
      expect(remaining).toHaveLength(20);
      // The oldest is the one that went.
      expect(remaining).not.toContain('2026-01-01T00-00-00.json');
      expect(remaining).toContain('2026-01-01T00-00-20.json');
    });
  });

  describe('concurrent runs', () => {
    it('do not overwrite each other when they finish together', async () => {
      // Two sessions signalled by one `pkill` finish in the same millisecond,
      // which a timestamp alone cannot tell apart.
      const dir = setupTmpDir();
      const stamp = '2026-01-01T00-00-00-000Z';

      for (const pid of [111, 222]) {
        const profile = new ShipProfile();
        profile.start('session')();
        await profile.write(dir, `${stamp}-${pid}.json`);
      }

      const { readdirSync } = await import('fs-extra');
      expect(readdirSync(dir).sort()).toEqual([
        `${stamp}-111.json`,
        `${stamp}-222.json`,
      ]);
    });
  });

  describe('has', () => {
    it('reports whether a top-level span was recorded', () => {
      const profile = new ShipProfile();
      expect(profile.has('session')).toBe(false);

      profile.start('session')();
      expect(profile.has('session')).toBe(true);
    });
  });

  describe('format', () => {
    it('summarizes phases with their share of the total', () => {
      const profile = new ShipProfile();
      const endSession = profile.start('session');
      profile.start('start agent session')();
      endSession();

      const summary = profile.format();

      expect(summary).toContain('Timing');
      expect(summary).toContain('session');
      expect(summary).toContain('start agent session');
    });

    it('collapses tool calls nested inside a turn inside a session', () => {
      // The shape a real run produces. An earlier depth limit dropped this
      // line, hiding the one number that says whether a slow turn was the
      // model or the tools.
      const profile = new ShipProfile();
      const endSession = profile.start('session');
      const endTurn = profile.start('turn 1');
      profile.record(`${TOOL_SPAN_PREFIX}bash`, performance.now(), 2000);
      endTurn();
      endSession();

      expect(profile.format()).toContain('tools (1 call)');
    });

    it('collapses tool calls into one line', () => {
      const profile = new ShipProfile();
      const endTurn = profile.start('turn 1');
      profile.record(`${TOOL_SPAN_PREFIX}bash`, performance.now(), 1000);
      profile.record(`${TOOL_SPAN_PREFIX}bash`, performance.now(), 2000);
      profile.record(`${TOOL_SPAN_PREFIX}read`, performance.now(), 500);
      endTurn();

      const summary = profile.format();

      expect(summary).toContain('tools (3 calls)');
      expect(summary).not.toContain(`${TOOL_SPAN_PREFIX}bash`);
      // Time spent in tools, summed across calls that may have overlapped.
      expect(summary).toContain('3.5s');
    });
  });
});
