import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';

const sampleRows = [
  {
    date: '2026-05-18',
    group: 'model',
    name: 'Gemini 3 Flash',
    metric: 'requests',
    modality: 'all',
    share_percent: 18.1487,
  },
  {
    date: '2026-05-18',
    group: 'model',
    name: 'Claude Sonnet 4.6',
    metric: 'requests',
    modality: 'all',
    share_percent: 4.1667,
  },
  {
    date: '2026-05-17',
    group: 'model',
    name: 'Gemini 3 Flash',
    metric: 'requests',
    modality: 'all',
    share_percent: 15.0,
  },
  {
    date: '2026-05-18',
    group: 'model',
    name: 'Claude Opus 4.8',
    metric: 'spend',
    modality: 'all',
    share_percent: 22.2,
  },
];

const sampleCsv =
  'date,group,name,metric,modality,share_percent\n2026-05-18,model,Gemini 3 Flash,requests,all,18.15\n';

function useLeaderboard(opts: { rows?: unknown[]; csv?: string } = {}) {
  let query: Record<string, string> | undefined;
  client.scenario.get('/api/ai/leaderboard-export', (req, res) => {
    query = req.query;
    if (req.query.format === 'csv') {
      res.setHeader('content-type', 'text/csv');
      res.end(opts.csv ?? sampleCsv);
      return;
    }
    res.json({
      dataset: req.query.dataset,
      modality: req.query.modality,
      license: 'CC-BY-4.0',
      license_url: 'https://creativecommons.org/licenses/by/4.0/',
      rows: opts.rows ?? sampleRows,
    });
  });
  return () => query;
}

describe('ai-gateway leaderboard models', () => {
  beforeEach(() => {
    process.env.VERCEL_LEADERBOARD_URL = client.apiUrl;

    (client.stdin as unknown as { isTTY: boolean }).isTTY = false;
    (client.stdout as unknown as { isTTY: boolean }).isTTY = false;
  });

  afterEach(() => {
    delete process.env.VERCEL_LEADERBOARD_URL;
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'leaderboard', 'models', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:leaderboard', value: 'leaderboard' },
        { key: 'flag:help', value: 'ai-gateway leaderboard:models' },
      ]);
    });
  });

  it('outputs JSON by default in a non-TTY', async () => {
    useUser();
    useLeaderboard();
    client.setArgv('ai-gateway', 'leaderboard', 'models');

    const exitCodePromise = aiGateway(client);
    await expect(client.stdout).toOutput('"dataset": "models"');
    expect(await exitCodePromise).toBe(0);
  });

  it('renders a ranked table with --format table', async () => {
    useUser();
    useLeaderboard();
    client.setArgv('ai-gateway', 'leaderboard', 'models', '--format', 'table');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('Gemini 3 Flash');
    expect(await exitCodePromise).toBe(0);
  });

  it('passes --modality through to the request', async () => {
    useUser();
    const getQuery = useLeaderboard();
    client.setArgv(
      'ai-gateway',
      'leaderboard',
      'models',
      '--format',
      'json',
      '--modality',
      'text'
    );

    const exitCodePromise = aiGateway(client);
    await expect(client.stdout).toOutput('"rows"');
    expect(await exitCodePromise).toBe(0);
    expect(getQuery()?.modality).toBe('text');
  });

  it('filters the table to the chosen --metric', async () => {
    useUser();
    useLeaderboard();
    client.setArgv(
      'ai-gateway',
      'leaderboard',
      'models',
      '--format',
      'table',
      '--metric',
      'spend'
    );

    const exitCodePromise = aiGateway(client);
    await expect(client.stdout).toOutput('Claude Opus 4.8');
    expect(await exitCodePromise).toBe(0);
  });

  it('errors on a --date with no data', async () => {
    useUser();
    useLeaderboard();
    client.setArgv(
      'ai-gateway',
      'leaderboard',
      'models',
      '--format',
      'table',
      '--date',
      '2000-01-01'
    );

    const exitCodePromise = aiGateway(client);
    await expect(client.stderr).toOutput('No data for 2000-01-01');
    expect(await exitCodePromise).toBe(1);
  });

  it('passes format=csv through and prints it', async () => {
    useUser();
    const getQuery = useLeaderboard();
    client.setArgv('ai-gateway', 'leaderboard', 'models', '--format', 'csv');

    const exitCodePromise = aiGateway(client);
    await expect(client.stdout).toOutput('share_percent');
    expect(await exitCodePromise).toBe(0);
    expect(getQuery()?.format).toBe('csv');
  });

  it('writes to a file with --out', async () => {
    useUser();
    useLeaderboard();
    const out = join(tmpdir(), 'vercel-leaderboard-test.json');
    if (existsSync(out)) unlinkSync(out);
    client.setArgv('ai-gateway', 'leaderboard', 'models', '--out', out);

    const exitCodePromise = aiGateway(client);
    await expect(client.stderr).toOutput('Wrote Top models');
    expect(await exitCodePromise).toBe(0);
    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out, 'utf8')).toContain('"dataset": "models"');
    unlinkSync(out);
  });

  it('rejects --format table with --out', async () => {
    useUser();
    useLeaderboard();
    client.setArgv(
      'ai-gateway',
      'leaderboard',
      'models',
      '--format',
      'table',
      '--out',
      join(tmpdir(), 'nope.txt')
    );

    const exitCodePromise = aiGateway(client);
    await expect(client.stderr).toOutput('Cannot write the table view');
    expect(await exitCodePromise).toBe(1);
  });

  it('rejects an invalid --format', async () => {
    useUser();
    useLeaderboard();
    client.setArgv('ai-gateway', 'leaderboard', 'models', '--format', 'xml');

    const exitCodePromise = aiGateway(client);
    await expect(client.stderr).toOutput('Invalid format');
    expect(await exitCodePromise).toBe(1);
  });

  it('prompts for modality and metric in an interactive TTY', async () => {
    useUser();
    const getQuery = useLeaderboard();
    (client.stdin as unknown as { isTTY: boolean }).isTTY = true;
    (client.stdout as unknown as { isTTY: boolean }).isTTY = true;
    const selectMock = vi
      .fn()
      .mockResolvedValueOnce('image')
      .mockResolvedValueOnce('spend');
    client.input.select = selectMock as never;

    client.setArgv('ai-gateway', 'leaderboard', 'models');

    const exitCodePromise = aiGateway(client);
    await expect(client.stdout).toOutput('Claude Opus 4.8');
    expect(await exitCodePromise).toBe(0);
    expect(selectMock).toHaveBeenCalledTimes(2);
    expect(getQuery()?.modality).toBe('image');
  });
});
