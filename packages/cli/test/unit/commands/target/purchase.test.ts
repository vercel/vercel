import { describe, it, expect, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { defaultProject, useProject } from '../../../mocks/project';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { useTeams } from '../../../mocks/team';
import target from '../../../../src/commands/target';

const PACK_SIZE = 5;

function useSettingsEndpoint(
  settings: {
    purchasedAmount?: number;
    minPurchasedAmount?: number;
    maxPurchasedAmount?: number;
  } = {}
) {
  const {
    purchasedAmount = 0,
    minPurchasedAmount = 0,
    maxPurchasedAmount = 10,
  } = settings;

  client.scenario.get(
    `/v1/projects/custom-environments/settings`,
    (_req, res) => {
      res.json({
        packSize: PACK_SIZE,
        baseline: 1,
        purchasedAmount,
        minPurchasedAmount,
        maxPurchasedAmount,
        effectiveLimit: 1 + purchasedAmount,
        environmentsUsed: 1,
      });
    }
  );
}

function usePurchaseEndpoint() {
  client.scenario.post(
    `/v1/projects/custom-environments/settings`,
    (req, res) => {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      res.json({ purchasedAmount: body.purchasedAmount });
    }
  );
}

describe('target purchase', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
    });
    client.cwd = setupUnitFixture('commands/deploy/static');
    client.stderr.isTTY = false;
  });

  it('errors when packs argument is missing', async () => {
    client.setArgv('target', 'purchase');
    const exitCode = await target(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Missing packs argument');
  });

  it('errors when packs is not a number', async () => {
    client.setArgv('target', 'purchase', 'abc');
    const exitCode = await target(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Invalid packs "abc"');
  });

  it('purchases custom environment packs successfully', async () => {
    useSettingsEndpoint();
    usePurchaseEndpoint();
    client.setArgv('target', 'purchase', '2', '--yes');
    const exitCode = await target(client);
    expect(exitCode).toBe(0);
  });

  it('outputs JSON on success', async () => {
    useSettingsEndpoint();
    usePurchaseEndpoint();
    client.setArgv('target', 'purchase', '2', '--yes', '--format=json');
    const exitCode = await target(client);
    expect(exitCode).toBe(0);

    const stdoutOutput = client.stdout.getFullOutput();
    const parsed = JSON.parse(stdoutOutput);
    expect(parsed.packs).toBe(2);
    expect(parsed.purchasedAmount).toBe(PACK_SIZE * 2);
    expect(parsed.project).toBe('static');
  });

  it('errors when packs are outside the allowed range', async () => {
    useSettingsEndpoint({ maxPurchasedAmount: PACK_SIZE });
    client.setArgv('target', 'purchase', '2', '--yes');
    const exitCode = await target(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Packs must be between');
  });
});
