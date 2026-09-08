import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import {
  useFirewallActivity,
  firewallActivity,
  createO11yFirewallAlert,
} from '../../../mocks/firewall';
import { findFirewallAlert } from '../../../../src/util/firewall/get-firewall-alerts';

const STARTED = Date.UTC(2026, 7, 21, 3, 0, 0);
const LEGACY_ID = `team_dummy-firewall-test-project-${STARTED}`;
const TIMEOUT_MS = 80;

describe('findFirewallAlert timeout budgets', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useFirewallActivity({
      alertGroups: {
        [LEGACY_ID]: {
          id: LEGACY_ID,
          alerts: [createO11yFirewallAlert({ id: LEGACY_ID })],
        },
      },
    });
    // A legacy id reads attack-status first and falls back to the alerts
    // group. One signal shared between the two let a slow first call spend
    // the whole budget, and the fallback's `catch` reported the abort that
    // followed as "no such alert".
    firewallActivity.attackStatusDelayMs = TIMEOUT_MS * 4;
  });

  it('still answers from the fallback after the first call times out', async () => {
    const resolved = await findFirewallAlert(client, {
      projectId: 'firewall-test-project',
      teamId: 'team_dummy',
      alertId: LEGACY_ID,
      timeoutMs: TIMEOUT_MS,
    });
    expect(resolved?.alert.id).toEqual(LEGACY_ID);
  });
});
