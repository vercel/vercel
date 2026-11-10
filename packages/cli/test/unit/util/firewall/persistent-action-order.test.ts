import { describe, expect, it, beforeEach, beforeAll, afterAll } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useFirewallActivity,
  createPersistentAction,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

const IP = '51.158.168.18';

// US spring forward: 02:00 local never happens, so `new Date` reading the
// API's zoneless timestamps as local maps 02:30 and 03:30 to the same instant.
const BEFORE_GAP = Date.UTC(2026, 2, 8, 2, 30, 0);
const AFTER_GAP = Date.UTC(2026, 2, 8, 3, 30, 0);

describe('persistent action ordering across a DST transition', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'firewall-test-project',
      name: 'firewall-test',
    });
    client.cwd = setupUnitFixture('commands/firewall');
    useFirewallActivity({
      events: [
        // Counts run against the timestamps, so a tie broken by count picks
        // the older row and labels it the most recent.
        createPersistentAction({
          startTime: BEFORE_GAP,
          endTime: BEFORE_GAP + 600_000,
          ip: IP,
          count: 99,
        }),
        createPersistentAction({
          startTime: AFTER_GAP,
          endTime: AFTER_GAP + 600_000,
          ip: IP,
          count: 4,
        }),
      ],
    });
  });

  it('confirms the two timestamps do collapse under a local reading', () => {
    expect(new Date('2026-03-08T02:30:00.000').getTime()).toEqual(
      new Date('2026-03-08T03:30:00.000').getTime()
    );
  });

  it('shows the later action when two collapse to one local instant', async () => {
    client.setArgv('firewall', 'persistent-actions', 'inspect', IP);
    expect(await firewall(client)).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Showing the most recent of 2');
    expect(out).toContain('03:30');
    expect(out).not.toContain('02:30');
  });
});
