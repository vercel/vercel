import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import aiGateway from '../../../../src/commands/ai-gateway';
import logs from '../../../../src/commands/ai-gateway/logs';
import { client } from '../../../mocks/client';

const generationId = 'gen_01K00000000000000000000000';

const sampleRow = {
  aiModel: 'anthropic/claude-sonnet-4.5',
  aiProvider: 'anthropic',
  aiRequestDurationMs: 1250,
  cachedInputTokens: 100,
  cacheCreationInputTokens: 20,
  contentCaptureInputs: 'private prompt data',
  cost: 0.0012,
  costCurrency: 'USD',
  environment: 'production',
  generationId,
  httpStatus: 200,
  inferenceGeoRegion: 'iad1',
  inputTokens: 1000,
  outputTokens: 200,
  projectId: 'prj_123',
  reasoningTokens: 50,
  reportingWriteCost: 0.0001,
  timeToFirstTokenMs: 300,
  timestamp: '2026-08-03 20:00:00',
};

function useTeam() {
  client.config.currentTeam = 'team_123';
  client.scenario.get('/teams/team_123', (_req, res) => {
    res.json({ id: 'team_123', slug: 'acme', name: 'Acme' });
  });
}

function useLogs(rows: unknown[] = [sampleRow]) {
  client.scenario.get('/api/ai/gateway-inference-requests', (req, res) => {
    expect(req.query.teamId).toBe('team_123');
    res.json({
      data: rows,
      pageInfo: { limit: 20, offset: 0, returned: rows.length },
    });
  });
}

describe('ai-gateway logs list', () => {
  beforeEach(() => {
    process.env.VERCEL_AI_GATEWAY_LOGS_API_URL = `${client.apiUrl}/api/ai/gateway-inference-requests`;
    useTeam();
  });

  afterEach(() => {
    delete process.env.VERCEL_AI_GATEWAY_LOGS_API_URL;
  });

  it('shows logs subcommand help', async () => {
    client.setArgv('ai-gateway', 'logs', '--help');

    expect(await aiGateway(client)).toBe(2);
    const help = client.stderr.getFullOutput();
    expect(help).toContain('list');
    expect(help).toContain('inspect');
  });

  it('shows logs help without treating no arguments as an error', async () => {
    client.setArgv('ai-gateway', 'logs');

    expect(await aiGateway(client)).toBe(2);
    const help = client.stderr.getFullOutput();
    expect(help).toContain('list');
    expect(help).toContain('inspect');
    expect(help).not.toContain('Invalid subcommand');
  });

  it('returns agent-traversable subcommands when no action is provided', async () => {
    client.nonInteractive = true;
    client.isAgent = true;
    client.setArgv('ai-gateway', 'logs');

    expect(await aiGateway(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'action_required',
      reason: 'missing_arguments',
      next: [
        { command: expect.stringContaining('logs list') },
        { command: expect.stringContaining('logs inspect') },
      ],
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('shows list help with filters and JSON output', async () => {
    client.setArgv('ai-gateway', 'logs', 'list', '--help');

    expect(await logs(client)).toBe(2);
    const help = client.stderr.getFullOutput();
    expect(help).toContain('--provider');
    expect(help).toContain('--search');
    expect(help).toContain('--status');
    expect(help).toContain('--format');
    expect(help).toContain('--json');
  });

  it('lists request fields in a table', async () => {
    useLogs();
    client.setArgv('ai-gateway', 'logs', 'list');

    expect(await logs(client)).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain(generationId);
    expect(stdout).toContain('anthropic/claude-sonnet-4.5');
    expect(stdout).toContain('IAD1');
    expect(stdout).toContain('1,250');
  });

  it('outputs a normalized, bounded JSON contract', async () => {
    useLogs();
    client.setArgv('ai-gateway', 'logs', 'list', '--limit', '1', '--json');

    expect(await logs(client)).toBe(0);
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result).toMatchObject({
      status: 'success',
      reason: 'ai_gateway_logs_listed',
      data: {
        requests: [
          {
            generationId,
            cost: { total: 0.0013, inference: 0.0012, currency: 'USD' },
            tokens: {
              input: 1000,
              cachedInput: 100,
              cacheCreationInput: 20,
              output: 200,
              reasoning: 50,
              total: 1250,
            },
          },
        ],
        pagination: {
          page: 1,
          limit: 1,
          returned: 1,
          hasMore: true,
          nextPage: 2,
        },
      },
    });
    expect(client.stdout.getFullOutput()).not.toContain('private prompt data');
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('defaults to structured JSON when an agent is detected', async () => {
    useLogs();
    client.nonInteractive = true;
    client.isAgent = true;
    client.setArgv('ai-gateway', 'logs', 'list');

    expect(await logs(client)).toBe(0);
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result).toMatchObject({
      status: 'success',
      reason: 'ai_gateway_logs_listed',
      data: { team: { id: 'team_123', slug: 'acme' } },
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('returns a structured empty result in JSON mode', async () => {
    useLogs([]);
    client.setArgv('ai-gateway', 'logs', 'list', '--json');

    expect(await logs(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'success',
      data: {
        requests: [],
        pagination: { returned: 0, hasMore: false, nextPage: null },
      },
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('resolves a project and sends filters', async () => {
    client.scenario.get('/v9/projects/my-app', (_req, res) => {
      res.json({ id: 'prj_123', name: 'my-app' });
    });
    client.scenario.get('/api/ai/gateway-inference-requests', (req, res) => {
      expect(req.query).toMatchObject({
        projectId: 'prj_123',
        q: generationId,
        environment: 'production',
        aiProvider: 'anthropic',
        aiModel: 'anthropic/claude-sonnet-4.5',
        status: '5xx',
        limit: '10',
        offset: '10',
      });
      res.json({ data: [], pageInfo: { returned: 0 } });
    });
    client.setArgv(
      'ai-gateway',
      'logs',
      'list',
      '--project',
      'my-app',
      '--search',
      generationId,
      '--environment',
      'production',
      '--provider',
      'anthropic',
      '--model',
      'anthropic/claude-sonnet-4.5',
      '--status',
      '5xx',
      '--page',
      '2',
      '--limit',
      '10'
    );

    expect(await logs(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No AI Gateway requests match the current filters.'
    );
  });

  it('rejects invalid status filters before fetching logs', async () => {
    client.setArgv('ai-gateway', 'logs', 'list', '--status', 'failed');

    expect(await logs(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Status must be an HTTP code or class'
    );
  });

  it('returns action-required JSON when an agent has no team', async () => {
    client.config.currentTeam = undefined;
    client.nonInteractive = true;
    client.setArgv('ai-gateway', 'logs', 'list');

    expect(await logs(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'action_required',
      reason: 'missing_scope',
      next: [{ command: expect.stringContaining('--scope <team-slug>') }],
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('returns structured API errors for agents', async () => {
    client.nonInteractive = true;
    client.scenario.get('/api/ai/gateway-inference-requests', (_req, res) => {
      res.status(403).json({ error: { message: 'forbidden' } });
    });
    client.setArgv('ai-gateway', 'logs', 'list');

    expect(await logs(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'permission_denied',
      next: expect.any(Array),
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });
});
