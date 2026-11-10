import { beforeEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from 'strip-ansi';

import experiments from '../../../../src/commands/experiments';
import { client } from '../../../mocks/client';
import {
  defaultExperimentAnalysis,
  defaultExperiments,
  useExperimentEvents,
  useExperiments,
  useMicrofrontends,
} from '../../../mocks/experiments';
import { help as rootHelp } from '../../../../src/help';
import { getRootHelpCommands } from '../../../../src/commands/root-help';
import { commandsStructs } from '../../../../src/commands';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

function resetExperimentScenario(
  analysis = defaultExperimentAnalysis,
  onAnalysis?: (body: Record<string, unknown>) => void,
  options: { experimentsEnabled?: boolean; analysisEnabled?: boolean } = {}
): void {
  client.reset();
  useUser();
  useTeams('team_dummy');
  useProject({
    ...defaultProject,
    id: 'vercel-flags-test',
    name: 'vercel-flags-test',
    accountId: 'team_dummy',
    analytics: { id: 'dsn_example', enabledAt: Date.now() },
  });
  useExperiments(undefined, analysis, onAnalysis, options);
  client.cwd = setupUnitFixture('commands/flags/vercel-flags-test');
}

describe('experiments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.nonInteractive = false;
    resetExperimentScenario();
  });

  it('shows command help when no subcommand is provided', async () => {
    client.setArgv('experiments');

    expect(await experiments(client)).toBe(2);

    const stderr = stripAnsi(client.stderr.getFullOutput());
    expect(stderr).toContain('Manage and analyze feature flag experiments');
    expect(stderr).not.toContain('Commands:');
    expect(stderr).not.toContain('set-ramp');
    expect(stderr).not.toContain('restart-analysis');
    expect(stderr).not.toContain('return-to-draft');
  });

  it('does not advertise the command in root help', () => {
    expect(rootHelp(getRootHelpCommands(commandsStructs))).not.toContain(
      'experiments'
    );
  });

  it('reports when the limited preview is not enabled for the team', async () => {
    resetExperimentScenario(defaultExperimentAnalysis, undefined, {
      experimentsEnabled: false,
    });
    client.setArgv('experiments', 'ls');

    expect(await experiments(client)).toBe(1);

    const stderr = stripAnsi(client.stderr.getFullOutput());
    expect(stderr).toContain(
      'This command is currently in limited preview and isn’t enabled for your team.'
    );
    expect(stderr).not.toContain('Authentication error');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('returns a structured access denial for JSON output', async () => {
    resetExperimentScenario(defaultExperimentAnalysis, undefined, {
      experimentsEnabled: false,
    });
    client.setArgv('experiments', 'ls', '--format', 'json');

    expect(await experiments(client)).toBe(1);

    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'error',
      reason: 'experiments_not_enabled',
      message:
        'This command is currently in limited preview and isn’t enabled for your team.',
      userActionRequired: true,
    });
  });

  it('gracefully denies analysis when its endpoint is disabled', async () => {
    resetExperimentScenario(defaultExperimentAnalysis, undefined, {
      analysisEnabled: false,
    });
    client.setArgv(
      'experiments',
      'analyze',
      'checkout-copy',
      '--format',
      'json'
    );

    expect(await experiments(client)).toBe(1);

    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'experiments_not_enabled',
      userActionRequired: true,
    });
  });

  it('checks access before opening the experiments dashboard', async () => {
    resetExperimentScenario(defaultExperimentAnalysis, undefined, {
      experimentsEnabled: false,
    });
    client.setArgv('experiments', 'open');

    expect(await experiments(client)).toBe(1);

    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'This command is currently in limited preview and isn’t enabled for your team.'
    );
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('lists experiments and suggests next commands', async () => {
    client.setArgv('experiments', 'ls');

    expect(await experiments(client)).toBe(0);

    const stderr = stripAnsi(client.stderr.getFullOutput());
    expect(stderr).toContain('checkout-copy');
    expect(stderr).toContain('search-layout');
    expect(stderr).toContain(
      'Inspect experiment `vercel experiments inspect <experiment>`\n'
    );
    expect(stderr).toContain('Open experiments   `vercel experiments open`\n');
    expect(stderr).toContain(
      'Create experiment  `vercel experiments create --file <file>`\n'
    );
  });

  it('falls back to experiment IDs when the API response has no slugs', async () => {
    client.reset();
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
      accountId: 'team_dummy',
    });
    const experimentsWithoutSlugs = structuredClone(defaultExperiments);
    for (const experiment of experimentsWithoutSlugs) {
      delete experiment.slug;
    }
    useExperiments(experimentsWithoutSlugs);
    client.cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.setArgv('experiments', 'ls');

    expect(await experiments(client)).toBe(0);

    const stderr = stripAnsi(client.stderr.getFullOutput());
    expect(stderr).toContain('exp_running');
    expect(stderr).toContain('exp_draft');
    expect(stderr).not.toContain('undefined');
  });

  it('keeps JSON stdout machine-readable and includes next commands', async () => {
    client.setArgv('experiments', 'ls', '--format', 'json');

    expect(await experiments(client)).toBe(0);

    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result.status).toBe('success');
    expect(result.experiments).toHaveLength(2);
    expect(result.next).toContainEqual(
      expect.objectContaining({
        command: 'vercel experiments inspect <experiment>',
      })
    );
    expect(client.stdout.getFullOutput()).not.toContain('Fetching');
  });

  it('prints the slug after creating an experiment', async () => {
    client.stdin.isTTY = false;
    client.stdin.end(
      JSON.stringify({ name: 'Created experiment', slug: 'created-experiment' })
    );
    client.setArgv('experiments', 'create', '--file', '-');

    expect(await experiments(client)).toBe(0);

    const stderr = stripAnsi(client.stderr.getFullOutput());
    expect(stderr).toContain('✓ Created         Created experiment');
    expect(stderr).toContain('Slug            created-experiment');
    expect(stderr).toContain('experiments start created-experiment');
  });

  it('includes the slug in JSON after creating an experiment', async () => {
    client.stdin.isTTY = false;
    client.stdin.end(
      JSON.stringify({ name: 'Created experiment', slug: 'created-experiment' })
    );
    client.setArgv('experiments', 'create', '--file', '-', '--format', 'json');

    expect(await experiments(client)).toBe(0);

    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'success',
      experiment: { slug: 'created-experiment' },
    });
    expect(client.stderr.getFullOutput()).not.toContain('Slug');
  });

  it('shows state-aware connections for a running experiment', async () => {
    client.setArgv('experiments', 'inspect', 'checkout-copy');

    expect(await experiments(client)).toBe(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Analyze results');
    expect(stderr).toContain('experiments analyze checkout-copy');
    expect(stderr).toContain('Ramp exposures');
    expect(stderr).toContain('experiments set-ramp checkout-copy');
    expect(stderr).toContain('Make decision');
    expect(stderr).toContain('Control         control');
    expect(stderr).toContain('flags inspect checkout-copy-flag');
    expect(stderr).not.toContain('add-example-data');
  });

  it('starts a draft experiment and returns running next steps', async () => {
    client.setArgv(
      'experiments',
      'start',
      'search-layout',
      '--ramp',
      '10',
      '--yes'
    );

    expect(await experiments(client)).toBe(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('draft → running');
    expect(stderr).toContain('✓ Started');
    expect(stderr).toContain('10%');
    expect(stderr).toContain('Analyze results');
    expect(stderr).toContain('Ramp exposures');
  });

  it('requires explicit confirmation in non-interactive mode', async () => {
    client.nonInteractive = true;
    client.setArgv('experiments', 'set-ramp', 'checkout-copy', '--ramp', '50');

    expect(await experiments(client)).toBe(2);

    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
      userActionRequired: true,
    });
    expect(result.next[0].command).toContain('--yes');
  });

  it('rejects lifecycle actions from the wrong state before prompting', async () => {
    client.setArgv(
      'experiments',
      'set-ramp',
      'search-layout',
      '--ramp',
      '50',
      '--yes'
    );

    expect(await experiments(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Cannot change its ramp while the experiment is draft'
    );
  });

  it('treats returning a draft experiment to draft as an explicit no-op', async () => {
    client.setArgv('experiments', 'return-to-draft', 'search-layout');

    expect(await experiments(client)).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Experiment is already in draft.');
    expect(stderr).toContain('Start experiment');
  });

  it('analyzes every configured metric with its role', async () => {
    const onAnalysis = vi.fn();
    resetExperimentScenario(defaultExperimentAnalysis, onAnalysis);
    client.setArgv('experiments', 'analyze', 'checkout-copy');

    expect(await experiments(client)).toBe(0);

    expect(onAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        controlVariantId: 'control',
        expectedVariantWeights: { control: 50, treatment: 50 },
        excludeContaminated: false,
        unitKey: 'user_id',
        rampId: 'rmp_current',
        metrics: expect.objectContaining({
          conversion: expect.any(Object),
          revenue: expect.any(Object),
          errors: expect.any(Object),
        }),
      })
    );
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Primary');
    expect(stderr).toContain('Secondary');
    expect(stderr).toContain('Guardrail');
    expect(stderr).toContain('20.00%');
    expect(stderr).toContain('Trust');
    expect(stderr).toContain('Health checks passed');
    expect(stderr).toContain('No insufficiency detected');
    expect(stderr).toContain('p-value');
    expect(stderr).toContain('Significant');
    expect(stderr).not.toContain('95% CI');
    expect(stderr).not.toContain('95% confidence intervals');
    expect(stderr).not.toContain('Each row uses its own scale');
  });

  it('does not treat significance as proof of sufficient sample size', async () => {
    const analysis = structuredClone(defaultExperimentAnalysis);
    const treatment = analysis.metrics.conversion?.variants.find(
      variant => !variant.isBaseline
    );
    if (!treatment) throw new Error('Expected treatment fixture');
    treatment.exposedUnits = 3;
    treatment.isSignificant = true;
    treatment.requiredSampleSize = 4;
    resetExperimentScenario(analysis);
    client.setArgv('experiments', 'analyze', 'checkout-copy');

    expect(await experiments(client)).toBe(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Directional only — insufficient sample size');
    expect(stderr).toContain('~4 per arm are estimated for 80% power');
  });

  it('warns when the primary metric has insufficient sample size', async () => {
    const analysis = structuredClone(defaultExperimentAnalysis);
    const treatment = analysis.metrics.conversion?.variants.find(
      variant => !variant.isBaseline
    );
    if (!treatment) throw new Error('Expected treatment fixture');
    treatment.isSignificant = false;
    treatment.pValue = 0.2;
    treatment.requiredSampleSize = 500;
    resetExperimentScenario(analysis);
    client.setArgv('experiments', 'analyze', 'checkout-copy');

    expect(await experiments(client)).toBe(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Directional only — insufficient sample size');
    expect(stderr).toContain('Sample Size     Insufficient');
    expect(stderr).toContain(
      '! Insufficient sample size for primary metric `conversion`, variant `treatment`'
    );
    expect(stderr).toContain('~500 per arm are estimated for 80% power');
    expect(stderr).toContain('Keep running before deciding.');
  });

  it('includes the trust and sample-size assessment in JSON output', async () => {
    const analysis = structuredClone(defaultExperimentAnalysis);
    const treatment = analysis.metrics.conversion?.variants.find(
      variant => !variant.isBaseline
    );
    if (!treatment) throw new Error('Expected treatment fixture');
    treatment.isSignificant = false;
    treatment.requiredSampleSize = 500;
    resetExperimentScenario(analysis);
    client.setArgv(
      'experiments',
      'analyze',
      'checkout-copy',
      '--format',
      'json'
    );

    expect(await experiments(client)).toBe(0);

    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result.assessment).toMatchObject({
      trust: {
        status: 'directional',
        reasons: ['insufficient_sample_size'],
      },
      sampleSize: {
        status: 'insufficient',
        issues: [
          expect.objectContaining({
            metric: 'conversion',
            variantId: 'treatment',
            requiredUnitsPerArm: 500,
            remainingUnitsInSmallerArm: 400,
          }),
        ],
      },
    });
    expect(client.stdout.getFullOutput()).not.toContain(
      'Insufficient sample size for'
    );
  });

  it('marks comparisons untrustworthy when the sample ratio is mismatched', async () => {
    const analysis = structuredClone(defaultExperimentAnalysis);
    analysis.srm.isValid = false;
    analysis.srm.pValue = 0.0001;
    resetExperimentScenario(analysis);
    client.setArgv('experiments', 'analyze', 'checkout-copy');

    expect(await experiments(client)).toBe(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Do not trust — sample ratio mismatch');
    expect(stderr).toContain('Sample ratio mismatch detected (p=0.0001)');
    expect(stderr).toContain('do not trust comparisons');
  });

  it('deletes only the experiment and reports the released flag', async () => {
    client.setArgv(
      'experiments',
      'delete',
      'checkout-copy',
      '--confirm',
      'checkout-copy'
    );

    expect(await experiments(client)).toBe(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('✓ Deleted');
    expect(stderr).toContain('Released Flag');
    expect(stderr).toContain('checkout-copy-flag');
    expect(stderr).toContain('Edit flag');
    expect(stderr).toContain('flags open checkout-copy-flag');
  });

  it('requires typed deletion proof for agents', async () => {
    client.nonInteractive = true;
    client.setArgv('experiments', 'delete', 'checkout-copy');

    expect(await experiments(client)).toBe(1);

    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result.reason).toBe('confirmation_required');
    expect(result.next[0].command).toContain(
      'experiments delete checkout-copy --confirm checkout-copy'
    );
    expect(client.stderr.getFullOutput()).not.toContain('Type checkout-copy');
  });

  describe('diagnose', () => {
    const exposure = {
      timestamp: '2026-09-01T10:00:00.000Z',
      type: 'exposure',
      eventName: 'exp_running',
      eventData: JSON.stringify({
        variantId: 'treatment',
        unitKey: 'event_data.visitorId',
        unitValue: 'unit-1',
        assignmentReason: 'experiment',
        rampId: 'rmp_current',
      }),
    };
    const metricEvent = {
      timestamp: '2026-09-01T10:00:05.000Z',
      type: 'event',
      eventName: 'checkout',
      eventData: JSON.stringify({ visitorId: 'unit-1', revenue: 12 }),
    };

    it('merges exposures and metric events newest first', async () => {
      useExperimentEvents({ exposures: [exposure], events: [metricEvent] });
      client.setArgv('experiments', 'diagnose', 'checkout-copy');

      expect(await experiments(client)).toBe(0);

      const stderr = stripAnsi(client.stderr.getFullOutput());
      expect(stderr).toContain('checkout-copy');
      expect(stderr).toContain('exposure');
      expect(stderr).toContain('checkout');
      expect(stderr).toContain('treatment');
      // The later metric event must sort above the exposure.
      expect(stderr.indexOf('10:00:05')).toBeLessThan(
        stderr.indexOf('10:00:00')
      );
    });

    it('reads both kinds in one time-ordered query', async () => {
      const bodies: Record<string, unknown>[] = [];
      useExperimentEvents({
        exposures: [exposure],
        events: [metricEvent],
        onQuery: body => bodies.push(body),
      });
      client.setArgv('experiments', 'diagnose', 'checkout-copy');

      expect(await experiments(client)).toBe(0);

      expect(bodies).toHaveLength(1);
      const filter = String(bodies[0].filter);
      expect(filter).toContain('type:exposure AND eventName:"exp_running"');
      expect(filter).toContain('type:event');
      expect(filter).toContain('"checkout"');
      // Matching by unit would hide events from units this page never named.
      expect(filter).not.toContain('visitorId');
      expect(bodies[0].order).toBe('desc');
    });

    it('reads a microfrontend child from its default app', async () => {
      const bodies: Record<string, unknown>[] = [];
      useMicrofrontends({
        projects: [
          {
            id: 'prj_default_app',
            microfrontends: { enabled: true, isDefaultApp: true },
          },
          {
            id: 'vercel-flags-test',
            microfrontends: {
              enabled: true,
              isDefaultApp: false,
              routeObservabilityToDefaultApp: true,
            },
          },
        ],
      });
      useExperimentEvents({
        exposures: [exposure],
        events: [metricEvent],
        onQuery: body => bodies.push(body),
      });
      client.setArgv('experiments', 'diagnose', 'checkout-copy');

      expect(await experiments(client)).toBe(0);

      // Exposures live under the default app, not the experiment's project.
      for (const body of bodies) {
        expect(body.scope).toEqual({
          ownerId: 'team_dummy',
          projectIds: ['prj_default_app'],
        });
      }
      expect(stripAnsi(client.stderr.getFullOutput())).toContain(
        'prj_default_app'
      );
    });

    it('keeps a non-microfrontend project as its own data project', async () => {
      const bodies: Record<string, unknown>[] = [];
      useMicrofrontends();
      useExperimentEvents({
        exposures: [exposure],
        events: [metricEvent],
        onQuery: body => bodies.push(body),
      });
      client.setArgv('experiments', 'diagnose', 'checkout-copy');

      expect(await experiments(client)).toBe(0);

      expect(bodies[0].scope).toEqual({
        ownerId: 'team_dummy',
        projectIds: ['vercel-flags-test'],
      });
    });

    it('shows the unit instead of repeating the experiment ID', async () => {
      useExperimentEvents({ exposures: [exposure], events: [metricEvent] });
      client.setArgv('experiments', 'diagnose', 'checkout-copy');

      expect(await experiments(client)).toBe(0);

      const stderr = stripAnsi(client.stderr.getFullOutput());
      // The header already names the experiment; the rows must not repeat it.
      expect(stderr).not.toContain('exp_running  ');
      expect(stderr).toContain('unit-1');
      expect(stderr).toContain('checkout');
    });

    it('reports exposures left behind by an earlier ramp', async () => {
      useExperimentEvents({
        exposures: [
          exposure,
          {
            ...exposure,
            timestamp: '2026-09-01T09:00:00.000Z',
            eventData: JSON.stringify({
              variantId: 'control',
              unitKey: 'event_data.visitorId',
              unitValue: 'unit-old',
              rampId: 'rmp_previous',
            }),
          },
        ],
        events: [],
      });
      client.setArgv(
        'experiments',
        'diagnose',
        'checkout-copy',
        '--limit',
        '5'
      );

      expect(await experiments(client)).toBe(0);

      expect(stripAnsi(client.stderr.getFullOutput())).toContain(
        '1 of these exposures came from an earlier ramp'
      );
    });

    it('sends a whole-second window, which the event requires', async () => {
      const bodies: Record<string, unknown>[] = [];
      useExperimentEvents({
        exposures: [exposure],
        events: [metricEvent],
        onQuery: body => bodies.push(body),
      });
      client.setArgv('experiments', 'diagnose', 'checkout-copy');

      expect(await experiments(client)).toBe(0);

      for (const body of bodies) {
        const range = body.timeRange as { start: string; end: string };
        // Millisecond precision is rejected with `must use whole seconds`.
        expect(range.start).toMatch(/T\d\d:\d\d:\d\d\.000Z$/);
        expect(range.end).toMatch(/T\d\d:\d\d:\d\d\.000Z$/);
      }
    });

    it('still returns metric events when no exposure is present', async () => {
      const bodies: Record<string, unknown>[] = [];
      useExperimentEvents({
        exposures: [],
        events: [metricEvent],
        onQuery: body => bodies.push(body),
      });
      client.setArgv('experiments', 'diagnose', 'checkout-copy');

      expect(await experiments(client)).toBe(0);

      expect(bodies).toHaveLength(1);
      expect(stripAnsi(client.stderr.getFullOutput())).toContain('checkout');
    });

    it('orders the page by time regardless of kind', async () => {
      useExperimentEvents({
        exposures: [
          { ...exposure, timestamp: '2026-09-01T10:00:00.000Z' },
          { ...exposure, timestamp: '2026-09-01T10:00:06.000Z' },
        ],
        events: [
          { ...metricEvent, timestamp: '2026-09-01T10:00:03.000Z' },
          { ...metricEvent, timestamp: '2026-09-01T10:00:09.000Z' },
        ],
      });
      client.setArgv('experiments', 'diagnose', 'checkout-copy');

      expect(await experiments(client)).toBe(0);

      const kinds = stripAnsi(client.stderr.getFullOutput())
        .split('\n')
        .filter(row => /^2026-/.test(row))
        .map(row => (row.includes('exposure') ? 'exposure' : 'event'));
      // Interleaved by timestamp, not grouped into one list per kind.
      expect(kinds).toEqual(['event', 'exposure', 'event', 'exposure']);
    });

    it('puts the header first and the newest row first without --follow', async () => {
      useExperimentEvents({
        exposures: [
          { ...exposure, timestamp: '2026-09-01T10:00:00.000Z' },
          { ...exposure, timestamp: '2026-09-01T10:00:09.000Z' },
        ],
        events: [],
      });
      client.setArgv('experiments', 'diagnose', 'checkout-copy');

      expect(await experiments(client)).toBe(0);

      const lines = stripAnsi(client.stderr.getFullOutput())
        .split('\n')
        .filter(line => /^(Time|2026-)/.test(line));
      expect(lines[0].startsWith('Time')).toBe(true);
      expect(lines[1]).toContain('10:00:09');
      expect(lines[2]).toContain('10:00:00');
    });

    it('lays the page out exactly as the tail does', async () => {
      useExperimentEvents({ exposures: [exposure], events: [metricEvent] });
      client.setArgv('experiments', 'diagnose', 'checkout-copy');

      expect(await experiments(client)).toBe(0);

      const rows = stripAnsi(client.stderr.getFullOutput())
        .split('\n')
        .filter(row => /^2026-/.test(row));
      expect(rows.length).toBe(2);
      // The page and the tail share one row builder, so a page followed by
      // --follow must not visibly change layout mid-stream.
      const offsets = rows.map(row => row.indexOf('exposure') + row.length * 0);
      expect(rows[0].indexOf('unit-1')).toBe(rows[1].indexOf('unit-1'));
      expect(offsets.every(offset => offset === -1 || offset === 26)).toBe(
        true
      );
    });

    describe('filters', () => {
      async function filterFor(...argv: string[]) {
        const bodies: Record<string, unknown>[] = [];
        useExperimentEvents({
          exposures: [exposure],
          events: [metricEvent],
          onQuery: body => bodies.push(body),
        });
        client.setArgv('experiments', 'diagnose', 'checkout-copy', ...argv);
        const exit = await experiments(client);
        return { exit, filter: String(bodies[0]?.filter ?? ''), bodies };
      }

      it('reads both kinds when nothing is named', async () => {
        const { exit, filter } = await filterFor();

        expect(exit).toBe(0);
        expect(filter).toContain('type:exposure');
        expect(filter).toContain('type:event');
      });

      it('narrows to exposures', async () => {
        const { exit, filter } = await filterFor('--exposures');

        expect(exit).toBe(0);
        expect(filter).toContain('type:exposure');
        expect(filter).not.toContain('type:event');
      });

      it('narrows to the named metric events', async () => {
        const { exit, filter } = await filterFor(
          '--event',
          'checkout',
          '--event',
          'purchase'
        );

        expect(exit).toBe(0);
        expect(filter).toContain('"checkout" OR "purchase"');
        expect(filter).not.toContain('type:exposure');
        expect(filter).not.toContain('checkout_error');
      });

      it('combines exposures with named events', async () => {
        const { exit, filter } = await filterFor(
          '--exposures',
          '--event',
          'checkout'
        );

        expect(exit).toBe(0);
        expect(filter).toContain('type:exposure');
        expect(filter).toContain('"checkout"');
        expect(filter).not.toContain('"purchase"');
      });

      it('matches a unit in every branch it reads', async () => {
        const { exit, filter } = await filterFor('--unit', 'unit-1');

        expect(exit).toBe(0);
        expect(filter.match(/eventData:\*unit-1\*/g)).toHaveLength(2);
      });

      it('applies a relative window', async () => {
        const { exit, bodies } = await filterFor('--since', '2h');

        expect(exit).toBe(0);
        const range = bodies[0].timeRange as { start: string; end: string };
        const spanMs =
          new Date(range.end).getTime() - new Date(range.start).getTime();
        expect(Math.round(spanMs / 3_600_000)).toBe(2);
      });

      it('rejects a metric event the experiment does not configure', async () => {
        const { exit } = await filterFor('--event', 'nope');

        expect(exit).toBe(1);
        expect(stripAnsi(client.stderr.getFullOutput())).toContain(
          'no metric event named "nope"'
        );
      });

      it('reports a rejection as JSON when --format json is set', async () => {
        useExperimentEvents();
        client.setArgv(
          'experiments',
          'diagnose',
          'checkout-copy',
          '--limit',
          '0',
          '--format',
          'json'
        );

        expect(await experiments(client)).toBe(2);

        // A JSON consumer gets a JSON error on stdout, not prose on stderr.
        const payload = JSON.parse(client.stdout.getFullOutput());
        expect(payload.error.code).toBe('INVALID_LIMIT');
        expect(payload.error.message).toContain('--limit');
      });

      it('refuses --follow together with --until', async () => {
        useExperimentEvents();
        client.setArgv(
          'experiments',
          'diagnose',
          'checkout-copy',
          '--follow',
          '--until',
          '1h'
        );

        expect(await experiments(client)).toBe(2);
        expect(stripAnsi(client.stderr.getFullOutput())).toContain(
          'cannot be combined with --until'
        );
      });

      it('allows --follow together with --since, which bounds the backfill', async () => {
        const bodies: Record<string, unknown>[] = [];
        useExperimentEvents({
          exposures: [exposure],
          events: [metricEvent],
          onQuery: body => bodies.push(body),
        });
        client.setArgv(
          'experiments',
          'diagnose',
          'checkout-copy',
          '--follow',
          '--since',
          '2h'
        );
        // The tail itself is covered separately; here the backfill window is
        // what matters, so the first query is enough.
        const run = experiments(client);
        await new Promise(resolve => setTimeout(resolve, 50));
        process.emit('SIGINT');
        await run;

        expect(bodies.length).toBeGreaterThan(0);
        const range = bodies[0].timeRange as { start: string; end: string };
        const spanMs =
          new Date(range.end).getTime() - new Date(range.start).getTime();
        expect(Math.round(spanMs / 3_600_000)).toBe(2);
      });

      it('rejects a window that ends before it starts', async () => {
        const { exit } = await filterFor('--since', '1h', '--until', '2h');

        expect(exit).toBe(2);
        // Wording comes from the shared validator, so it matches every other
        // command that takes --since/--until.
        expect(stripAnsi(client.stderr.getFullOutput())).toContain(
          '`--since` must be earlier than `--until`.'
        );
      });
    });

    it('reports an unknown experiment instead of an empty diagnosis', async () => {
      useExperimentEvents();
      client.setArgv('experiments', 'diagnose', 'does-not-exist');

      expect(await experiments(client)).toBe(1);

      const stderr = stripAnsi(client.stderr.getFullOutput());
      expect(stderr).toContain('Experiment not found');
    });

    it('rejects a limit outside the supported range', async () => {
      useExperimentEvents();
      client.setArgv(
        'experiments',
        'diagnose',
        'checkout-copy',
        '--limit',
        '0'
      );

      expect(await experiments(client)).toBe(2);

      expect(stripAnsi(client.stderr.getFullOutput())).toContain(
        '`--limit` must be an integer between 1 and 200.'
      );
    });

    it('reads a local observability-api when the override is set', async () => {
      const bodies: Record<string, unknown>[] = [];
      useExperimentEvents({
        exposures: [exposure],
        events: [metricEvent],
        onQuery: body => bodies.push(body),
        path: '/v1/events',
      });
      vi.stubEnv(
        'VERCEL_OBSERVABILITY_EVENTS_URL',
        `${client.apiUrl}/v1/events`
      );

      try {
        client.setArgv('experiments', 'diagnose', 'checkout-copy');

        expect(await experiments(client)).toBe(0);
        expect(bodies).toHaveLength(1);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('keeps JSON output machine-readable', async () => {
      useExperimentEvents({ exposures: [exposure], events: [metricEvent] });
      client.setArgv(
        'experiments',
        'diagnose',
        'checkout-copy',
        '--format',
        'json'
      );

      expect(await experiments(client)).toBe(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('success');
      expect(payload.experiment.id).toBe('exp_running');
      expect(payload.diagnosis.enrolledUnits).toBe(1);
      expect(payload.diagnosis.exposureCount).toBe(1);
      expect(payload.diagnosis.metricEventCount).toBe(1);
      expect(payload.diagnosis.events).toHaveLength(2);
      expect(payload.diagnosis.events[0].kind).toBe('event');
      expect(payload.diagnosis.events[1].variantId).toBe('treatment');
    });
  });
});
