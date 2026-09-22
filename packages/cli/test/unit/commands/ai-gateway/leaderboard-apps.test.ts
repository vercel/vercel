import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';

const appRows = [
  {
    rank: 1,
    name: 'Kilo Code',
    ranked_by: 'Token Volume',
    url: 'https://kilocode.ai',
    description: 'AI coding agent for VS Code',
  },
];

function useApps() {
  client.scenario.get('/api/ai/leaderboard-export', (_req, res) => {
    res.json({
      dataset: 'apps',
      license: 'CC-BY-4.0',
      license_url: 'https://creativecommons.org/licenses/by/4.0/',
      rows: appRows,
    });
  });
}

describe('ai-gateway leaderboard apps', () => {
  beforeEach(() => {
    process.env.VERCEL_LEADERBOARD_URL = client.apiUrl;
    (client.stdin as unknown as { isTTY: boolean }).isTTY = false;
    (client.stdout as unknown as { isTTY: boolean }).isTTY = false;
  });

  afterEach(() => {
    delete process.env.VERCEL_LEADERBOARD_URL;
  });

  it('outputs JSON by default in a non-TTY', async () => {
    useUser();
    useApps();
    client.setArgv('ai-gateway', 'leaderboard', 'apps');

    const exitCodePromise = aiGateway(client);
    await expect(client.stdout).toOutput('"dataset": "apps"');
    expect(await exitCodePromise).toBe(0);
  });

  it('renders a ranked table with --format table', async () => {
    useUser();
    useApps();
    client.setArgv('ai-gateway', 'leaderboard', 'apps', '--format', 'table');

    const exitCodePromise = aiGateway(client);
    await expect(client.stdout).toOutput('Kilo Code');
    expect(await exitCodePromise).toBe(0);
  });
});
