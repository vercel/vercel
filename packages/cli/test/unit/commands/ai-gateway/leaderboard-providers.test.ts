import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';

const rankedRows = [
  {
    rank: 1,
    name: 'DeepSeek',
    ranked_by: 'Token Volume',
    url: 'https://deepseek.com',
    description: 'AI research and deployment',
  },
  {
    rank: 2,
    name: 'Anthropic',
    ranked_by: 'Token Volume',
    url: 'https://anthropic.com',
    description: 'AI safety and research company',
  },
];

function useRanked(dataset: string) {
  let query: Record<string, string> | undefined;
  client.scenario.get('/api/ai/leaderboard-export', (req, res) => {
    query = req.query;
    if (req.query.format === 'csv') {
      res.setHeader('content-type', 'text/csv');
      res.end('rank,name\n1,DeepSeek\n');
      return;
    }
    res.json({
      dataset,
      license: 'CC-BY-4.0',
      license_url: 'https://creativecommons.org/licenses/by/4.0/',
      rows: rankedRows,
    });
  });
  return () => query;
}

describe('ai-gateway leaderboard providers', () => {
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
      client.setArgv('ai-gateway', 'leaderboard', 'providers', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:leaderboard', value: 'leaderboard' },
        { key: 'flag:help', value: 'ai-gateway leaderboard:providers' },
      ]);
    });
  });

  it('outputs JSON by default in a non-TTY', async () => {
    useUser();
    const getQuery = useRanked('providers');
    client.setArgv('ai-gateway', 'leaderboard', 'providers');

    const exitCodePromise = aiGateway(client);
    await expect(client.stdout).toOutput('"dataset": "providers"');
    expect(await exitCodePromise).toBe(0);

    expect(getQuery()?.modality).toBeUndefined();
  });

  it('renders a ranked table with --format table', async () => {
    useUser();
    useRanked('providers');
    client.setArgv(
      'ai-gateway',
      'leaderboard',
      'providers',
      '--format',
      'table'
    );

    const exitCodePromise = aiGateway(client);
    await expect(client.stdout).toOutput('DeepSeek');
    expect(await exitCodePromise).toBe(0);
  });

  it('passes format=csv through', async () => {
    useUser();
    const getQuery = useRanked('providers');
    client.setArgv('ai-gateway', 'leaderboard', 'providers', '--format', 'csv');

    const exitCodePromise = aiGateway(client);
    await expect(client.stdout).toOutput('DeepSeek');
    expect(await exitCodePromise).toBe(0);
    expect(getQuery()?.format).toBe('csv');
  });

  it('writes to a file with --out', async () => {
    useUser();
    useRanked('providers');
    const out = join(tmpdir(), 'vercel-leaderboard-providers.json');
    if (existsSync(out)) unlinkSync(out);
    client.setArgv('ai-gateway', 'leaderboard', 'providers', '--out', out);

    const exitCodePromise = aiGateway(client);
    await expect(client.stderr).toOutput('Wrote Top providers');
    expect(await exitCodePromise).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('"dataset": "providers"');
    unlinkSync(out);
  });
});
