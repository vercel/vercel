import { afterEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { ensureTeam } from '../../../../src/util/ai-gateway/ensure-team';

describe('ensureTeam', () => {
  afterEach(() => {
    client.config.currentTeam = undefined;
    client.nonInteractive = false;
    client.isAgent = false;
  });

  it('returns true when a team is already selected', async () => {
    client.config.currentTeam = 'team_abc';
    await expect(ensureTeam(client)).resolves.toBe(true);
  });

  it('errors instead of prompting when non-interactive, even on a TTY', async () => {
    client.config.currentTeam = undefined;
    client.nonInteractive = true;
    await expect(ensureTeam(client)).resolves.toBe(false);
    await expect(client.stderr).toOutput('No team selected');
  });

  it('errors instead of prompting for an agent attached to a TTY', async () => {
    client.config.currentTeam = undefined;
    client.nonInteractive = false;
    client.isAgent = true;
    await expect(ensureTeam(client)).resolves.toBe(false);
    await expect(client.stderr).toOutput('No team selected');
  });
});
