import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEventListeners } from 'node:events';
import stripAnsi from 'strip-ansi';

import { followExperimentEvents } from '../../../../src/commands/experiments/diagnose';
import {
  createDiagnosedEventPrinter,
  experimentUnitLabel,
  printExperimentDiagnosis,
} from '../../../../src/commands/experiments/output';
import type { ExperimentDiagnosis } from '../../../../src/commands/experiments/types';
import { client } from '../../../mocks/client';
import {
  defaultExperiments,
  useExperimentEvents,
} from '../../../mocks/experiments';
import type { Experiment } from '../../../../src/commands/experiments/types';

const experiment = defaultExperiments[0] as Experiment;

function exposure(timestamp: string, unit: string) {
  return {
    timestamp,
    type: 'exposure',
    eventName: experiment.id,
    eventData: JSON.stringify({
      variantId: 'treatment',
      unitKey: 'event_data.visitorId',
      unitValue: unit,
      rampId: 'rmp_current',
    }),
  };
}

async function follow(
  pages: Record<string, unknown>[][],
  onQuery?: (body: Record<string, unknown>) => void
) {
  useExperimentEvents({ pages, onQuery });
  return followExperimentEvents({
    client,
    experiment,
    ownerId: 'team_dummy',
    projectId: 'prj_1',
    filter: `(type:exposure AND eventName:"${experiment.id}") OR (type:event AND eventName:("checkout"))`,
    unitField: 'visitorId',
    from: new Date('2026-09-01T10:00:00.000Z'),
    seen: new Map(),
    json: false,
    intervalMs: 1,
    // Bounds the loop: the pages run out and the deadline ends the tail.
    timeoutMs: 120,
  });
}

const pageDiagnosis: ExperimentDiagnosis = {
  events: [
    // The API returns newest first; only the rendering order changes.
    {
      timestamp: '2026-09-01T10:00:09.000Z',
      kind: 'event',
      name: 'checkout',
      unit: 'unit-b',
    },
    {
      timestamp: '2026-09-01T10:00:00.000Z',
      kind: 'exposure',
      variantId: 'treatment',
      unit: 'unit-a',
    },
  ],
  projectId: 'prj_1',
  exposureCount: 1,
  metricEventCount: 1,
  enrolledUnits: 1,
  notEnrolledExposures: 0,
  metricEventNames: ['checkout'],
  unitField: 'visitorId',
  truncated: false,
  staleRampExposures: 0,
  window: {
    start: '2026-09-01T09:00:00.000Z',
    end: '2026-09-01T10:01:00.000Z',
  },
};

describe('experiments diagnose --follow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
  });

  it('prints each new row once, as it arrives', async () => {
    const exit = await follow([
      [exposure('2026-09-01T10:00:01.000Z', 'unit-a')],
      [exposure('2026-09-01T10:00:02.000Z', 'unit-b')],
      [],
    ]);

    expect(exit).toBe(0);
    const stderr = stripAnsi(client.stderr.getFullOutput());
    expect(stderr).toContain('unit-a');
    expect(stderr).toContain('unit-b');
    expect(stderr.split('unit-a').length - 1).toBe(1);
  });

  it('does not reprint the boundary second, but keeps a genuine repeat', async () => {
    const boundary = exposure('2026-09-01T10:00:01.000Z', 'unit-a');
    // The next poll re-reads the watermark second: once as the row already
    // printed, once as a second, real exposure of the same unit.
    const exit = await follow([[boundary], [boundary, boundary], []]);

    expect(exit).toBe(0);
    const stderr = stripAnsi(client.stderr.getFullOutput());
    expect(stderr.split('unit-a').length - 1).toBe(2);
  });

  it('polls forward with an ascending window', async () => {
    const bodies: Record<string, unknown>[] = [];
    await follow([[exposure('2026-09-01T10:00:01.000Z', 'unit-a')], []], body =>
      bodies.push(body)
    );

    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body.order).toBe('asc');
      const range = body.timeRange as { start: string; end: string };
      expect(range.start).toMatch(/\.000Z$/);
      expect(range.end).toMatch(/\.000Z$/);
    }
    // One query per poll, carrying both kinds.
    expect(String(bodies[0].filter)).toContain('type:exposure');
    expect(String(bodies[0].filter)).toContain('type:event');
  });

  it('advances the watermark past rows it has printed', async () => {
    const bodies: Record<string, unknown>[] = [];
    await follow(
      [
        [exposure('2026-09-01T10:00:05.000Z', 'unit-a')],
        [exposure('2026-09-01T10:00:09.000Z', 'unit-b')],
        [],
      ],
      body => bodies.push(body)
    );

    const starts = bodies.map(
      body => (body.timeRange as { start: string }).start
    );
    expect(starts[0]).toBe('2026-09-01T10:00:00.000Z');
    expect(starts[1]).toBe('2026-09-01T10:00:05.000Z');
  });
});

describe('poll loop hygiene', () => {
  beforeEach(() => {
    client.reset();
  });

  it('does not accumulate abort listeners across polls', async () => {
    // Sampled while the loop runs: aborting removes every `once` listener, so
    // counting afterwards would pass even when each poll leaked one.
    let peak = 0;
    const addEventListener = AbortSignal.prototype.addEventListener;
    vi.spyOn(AbortSignal.prototype, 'addEventListener').mockImplementation(
      function (
        this: AbortSignal,
        ...args: Parameters<typeof addEventListener>
      ) {
        const result = addEventListener.apply(this, args);
        peak = Math.max(peak, getEventListeners(this, 'abort').length);
        return result;
      }
    );

    try {
      // Enough polls to pass Node's 10-listener threshold several times over.
      await follow(Array.from({ length: 40 }, () => []));
    } finally {
      vi.restoreAllMocks();
    }

    expect(peak).toBeGreaterThan(0);
    // The loop holds at most its own sleep listener at any moment.
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('tail rendering', () => {
  beforeEach(() => {
    client.reset();
  });

  it('holds its columns whatever the variant length', () => {
    const print = createDiagnosedEventPrinter();
    print({
      timestamp: '2026-09-04T11:18:20.000Z',
      kind: 'exposure',
      variantId: 'treatment',
      unit: 'unit-a',
    });
    print({
      timestamp: '2026-09-04T11:18:21.000Z',
      kind: 'exposure',
      variantId: 'control',
      unit: 'unit-b',
    });
    print({
      timestamp: '2026-09-04T11:18:22.000Z',
      kind: 'event',
      name: 'sandbox:get-started:click',
      unit: 'unit-c',
    });

    const rows = stripAnsi(client.stderr.getFullOutput())
      .split('\n')
      .filter(Boolean);
    // `control` is shorter than `treatment`, and `event` than `exposure`, so
    // unpadded cells would walk the unit column left.
    const offsets = rows.map(row => row.indexOf('unit-'));
    expect(new Set(offsets).size).toBe(1);
    expect(offsets[0]).toBeGreaterThan(0);
  });
});

describe('page layout under --follow', () => {
  beforeEach(() => {
    client.reset();
  });

  const diagnosis = pageDiagnosis;

  function layout() {
    return stripAnsi(client.stderr.getFullOutput())
      .split('\n')
      .filter(line => /^(Time|2026-)/.test(line));
  }

  it('reads oldest first under the header', () => {
    printExperimentDiagnosis(experiment, diagnosis, { follow: true });

    const lines = layout();
    // Header leads, then oldest first so the live rows continue downwards.
    expect(lines[0].startsWith('Time')).toBe(true);
    expect(lines[1]).toContain('10:00:00');
    expect(lines[2]).toContain('10:00:09');
  });

  it('drops the truncation note, which a tail never outgrows', () => {
    printExperimentDiagnosis(
      experiment,
      { ...diagnosis, truncated: true },
      { follow: true }
    );

    const printed = stripAnsi(client.stderr.getFullOutput());
    expect(printed).not.toContain('Showing the newest');
  });

  it('keeps the truncation note on a static page', () => {
    printExperimentDiagnosis(experiment, { ...diagnosis, truncated: true });

    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Showing the newest'
    );
  });

  it('reads newest first under the header without follow', () => {
    printExperimentDiagnosis(experiment, diagnosis);

    const lines = layout();
    expect(lines[0].startsWith('Time')).toBe(true);
    expect(lines[1]).toContain('10:00:09');
    expect(lines[2]).toContain('10:00:00');
  });
});

describe('header repeats', () => {
  beforeEach(() => {
    client.reset();
  });

  function row(index: number) {
    return {
      timestamp: `2026-09-01T10:00:${String(index % 60).padStart(2, '0')}.000Z`,
      kind: 'exposure' as const,
      variantId: 'treatment',
      unit: `unit-${String(index)}`,
    };
  }

  it('reprints the columns every 50 rows', () => {
    const print = createDiagnosedEventPrinter();
    for (let index = 0; index < 120; index += 1) print(row(index));

    const headers = stripAnsi(client.stderr.getFullOutput())
      .split('\n')
      .filter(line => line.startsWith('Time')).length;
    // Rows 50 and 100, never before the first row.
    expect(headers).toBe(2);
  });

  it('spaces repeats against the rows the page already printed', () => {
    // The page printed 48, so rows 49 and 50 complete the block and the
    // header returns above row 51 rather than 50 rows into the tail.
    const print = createDiagnosedEventPrinter(48);
    print(row(1));
    print(row(2));
    expect(stripAnsi(client.stderr.getFullOutput())).not.toContain('Time ');

    print(row(3));

    const lines = stripAnsi(client.stderr.getFullOutput())
      .split('\n')
      .filter(Boolean);
    expect(lines[2].startsWith('Time')).toBe(true);
    expect(lines[3]).toContain('unit-3');
  });
});

describe('unit column label', () => {
  beforeEach(() => {
    client.reset();
  });

  it('renders the unit exactly as `inspect` does', () => {
    expect(experimentUnitLabel(experiment)).toBe(
      `${experiment.base.kind}.${experiment.base.attribute}`
    );
  });

  it('labels the event column as Unit', () => {
    printExperimentDiagnosis(experiment, pageDiagnosis);

    const printed = stripAnsi(client.stderr.getFullOutput());
    const header = printed.split('\n').find(line => line.startsWith('Time'));
    expect(header).toContain('Unit');
    expect(header).not.toContain(experimentUnitLabel(experiment));
    // The summary states the unit the way `inspect` does.
    expect(printed).toMatch(
      new RegExp(`Unit\\s+${experimentUnitLabel(experiment)}`)
    );
  });

  it('keeps rows aligned', () => {
    const print = createDiagnosedEventPrinter();
    print({
      timestamp: '2026-09-01T10:00:11.000Z',
      kind: 'exposure',
      variantId: 'treatment',
      unit: 'short',
    });
    print({
      timestamp: '2026-09-01T10:00:12.000Z',
      kind: 'event',
      name: 'checkout',
      unit: 'also-short',
    });

    const rows = stripAnsi(client.stderr.getFullOutput())
      .split('\n')
      .filter(Boolean);
    expect(rows[0].indexOf('short')).toBe(rows[1].indexOf('also-short'));
  });
});
