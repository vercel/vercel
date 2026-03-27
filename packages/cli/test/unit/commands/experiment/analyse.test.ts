import { describe, it, expect, beforeEach } from 'vitest';
import experiment from '../../../../src/commands/experiment';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('experiment analyse', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      // Must match `.vercel/project.json` projectId in the flags fixture.
      id: 'vercel-flags-test',
      name: 'experiment-test',
    });
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;

    client.scenario.get('/web/insights/experiment-results', (req, res) => {
      expect(req.query.projectId).toBe('vercel-flags-test');
      expect(req.query.experimentName).toBe('my-flag');
      expect(req.query.metricEventNames).toBe('purchase');
      expect(req.query.metricTypes).toBe('conversion');
      expect(req.query.unitField).toBe('visitorId');
      res.json({
        variants: [
          { name: 'control', conversionRate: 0.12 },
          { name: 'treatment', conversionRate: 0.15 },
        ],
      });
    });
  });

  it('fetches results and prints JSON summary', async () => {
    client.setArgv(
      'experiment',
      'analyse',
      'my-flag',
      '--json',
      '--metric-event-name',
      'purchase',
      '--metric-type',
      'conversion',
      '--unit-field',
      'visitorId'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toContain(
      '"experimentSlug": "my-flag"'
    );
    expect(client.stdout.getFullOutput()).toContain('control');
  });

  it('passes peek=true to the API', async () => {
    client.reset();
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'experiment-test',
    });
    client.cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.scenario.get('/web/insights/experiment-results', (req, res) => {
      expect(req.query.peek).toBe('true');
      res.json({ ok: true });
    });
    client.setArgv(
      'experiment',
      'analyse',
      'my-flag',
      '--peek',
      '--metric-event-name',
      'purchase'
    );
    const exitCode = await experiment(client);
    expect(exitCode).toBe(0);
  });

  it('errors when metric event names are missing', async () => {
    client.setArgv('experiment', 'analyse', 'my-flag');
    const exitCode = await experiment(client);
    expect(exitCode).toBe(1);
  });

  describe('--help', () => {
    it('shows help for analyse', async () => {
      client.setArgv('experiment', 'analyse', '--help');
      const exitCode = await experiment(client);
      expect(exitCode).toBe(2);
      expect(client.stderr.getFullOutput()).toContain('analyse');
    });
  });
});
