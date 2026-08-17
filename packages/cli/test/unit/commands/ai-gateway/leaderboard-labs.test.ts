import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';

const labRows = [
  {
    date: '2026-05-18',
    group: 'lab',
    name: 'google',
    metric: 'requests',
    modality: 'all',
    share_percent: 39.1981,
  },
  {
    date: '2026-05-18',
    group: 'lab',
    name: 'anthropic',
    metric: 'requests',
    modality: 'all',
    share_percent: 21.5,
  },
];

function useLabs() {
  let query: Record<string, string> | undefined;
  client.scenario.get('/api/ai/leaderboard-export', (req, res) => {
    query = req.query;
    res.json({
      dataset: 'labs',
      modality: req.query.modality,
      license: 'CC-BY-4.0',
      license_url: 'https://creativecommons.org/licenses/by/4.0/',
      rows: labRows,
    });
  });
  return () => query;
}

describe('ai-gateway leaderboard labs', () => {
  beforeEach(() => {
    process.env.VERCEL_LEADERBOARD_URL = client.apiUrl;
    (client.stdin as unknown as { isTTY: boolean }).isTTY = false;
    (client.stdout as unknown as { isTTY: boolean }).isTTY = false;
  });

  afterEach(() => {
    delete process.env.VERCEL_LEADERBOARD_URL;
  });

  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'leaderboard', 'labs', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:leaderboard', value: 'leaderboard' },
        { key: 'flag:help', value: 'ai-gateway leaderboard:labs' },
      ]);
    });
  });

  it('outputs JSON by default in a non-TTY', async () => {
    useUser();
    useLabs();
    client.setArgv('ai-gateway', 'leaderboard', 'labs');

    const exitCodePromise = aiGateway(client);
    await expect(client.stdout).toOutput('"dataset": "labs"');
    expect(await exitCodePromise).toBe(0);
  });

  it('renders a ranked table with --format table', async () => {
    useUser();
    useLabs();
    client.setArgv('ai-gateway', 'leaderboard', 'labs', '--format', 'table');

    const exitCodePromise = aiGateway(client);
    await expect(client.stdout).toOutput('google');
    expect(await exitCodePromise).toBe(0);
  });
});
