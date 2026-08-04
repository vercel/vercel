import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import logs from '../../../../src/commands/ai-gateway/logs';
import { client } from '../../../mocks/client';

const generationId = 'gen_01K00000000000000000000000';
const request = {
  aiModel: 'anthropic/claude-sonnet-4.5',
  aiProvider: 'anthropic',
  aiRequestDurationMs: 900,
  cost: 0.002,
  costCurrency: 'USD',
  environment: 'production',
  generationId,
  httpStatus: 200,
  inferenceGeoRegion: 'sfo1',
  inputTokens: 500,
  outputTokens: 100,
  projectId: 'prj_123',
  reasoningTokens: 25,
  timestamp: '2026-08-03 20:00:00',
};

const attempts = [
  {
    aiProvider: 'anthropic',
    providerAttemptCanonicalSlug: 'anthropic/claude-sonnet-4.5',
    providerAttemptCredentialType: 'vercel',
    providerAttemptError: '',
    providerAttemptModelIndex: 1,
    providerAttemptNumber: 2,
    providerAttemptStatusCode: 200,
    providerAttemptSuccess: '1',
    responseTimeMs: 600,
  },
  {
    aiProvider: 'bedrock',
    providerAttemptCanonicalSlug: 'anthropic/claude-sonnet-4.5',
    providerAttemptCredentialType: 'byok',
    providerAttemptError: 'rate limited',
    providerAttemptModelIndex: 0,
    providerAttemptNumber: 1,
    providerAttemptStatusCode: 429,
    providerAttemptSuccess: '0',
    responseTimeMs: 300,
  },
];

function useTeam() {
  client.config.currentTeam = 'team_123';
  client.scenario.get('/teams/team_123', (_req, res) => {
    res.json({ id: 'team_123', slug: 'acme', name: 'Acme' });
  });
}

function useRequest(row: unknown = request) {
  client.scenario.get('/api/ai/gateway-inference-requests', (req, res) => {
    expect(req.query.generationId).toBe(generationId);
    res.json({ data: row ? [row] : [], pageInfo: { returned: row ? 1 : 0 } });
  });
}

function useAttempts(rows: unknown[] = attempts) {
  client.scenario.post('/api/observability/metrics', (req, res) => {
    expect(req.query.slug).toBe('acme');
    expect(req.body).toMatchObject({
      event: 'aiGatewayProviderAttempt',
      scope: { type: 'team-with-slug', teamSlug: 'acme' },
      filter: `generationId eq '${generationId}'`,
      limit: 50,
    });
    res.json({ summary: rows });
  });
}

describe('ai-gateway logs inspect', () => {
  beforeEach(() => {
    process.env.VERCEL_AI_GATEWAY_LOGS_API_URL = `${client.apiUrl}/api/ai/gateway-inference-requests`;
    process.env.VERCEL_AI_GATEWAY_METRICS_API_URL = `${client.apiUrl}/api/observability/metrics`;
    useTeam();
  });

  afterEach(() => {
    delete process.env.VERCEL_AI_GATEWAY_LOGS_API_URL;
    delete process.env.VERCEL_AI_GATEWAY_METRICS_API_URL;
  });

  it('shows inspect help with the generation ID and JSON output', async () => {
    client.setArgv('ai-gateway', 'logs', 'inspect', '--help');

    expect(await logs(client)).toBe(2);
    const help = client.stderr.getFullOutput();
    expect(help).toContain('generationId');
    expect(help).toContain('--format');
  });

  it('shows the request and failures before successful attempts', async () => {
    useRequest();
    useAttempts();
    client.setArgv('ai-gateway', 'logs', 'inspect', generationId);

    expect(await logs(client)).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('Input tokens');
    expect(stdout).toContain('SFO1');
    expect(stdout.indexOf('failed')).toBeLessThan(stdout.indexOf('success'));
    expect(stdout).toContain('rate limited');
  });

  it('outputs normalized JSON with the ordered fallback path', async () => {
    useRequest();
    useAttempts();
    client.setArgv(
      'ai-gateway',
      'logs',
      'inspect',
      generationId,
      '--format',
      'json'
    );

    expect(await logs(client)).toBe(0);
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result.request).toMatchObject({ generationId, region: 'sfo1' });
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toMatchObject({
      provider: 'bedrock',
      success: false,
      statusCode: 429,
    });
    expect(result.attempts[1]).toMatchObject({
      provider: 'anthropic',
      success: true,
      statusCode: 200,
    });
  });

  it('rejects malformed Generation IDs before fetching', async () => {
    client.setArgv('ai-gateway', 'logs', 'inspect', 'gen_bad?query=1');

    expect(await logs(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Generation ID must be `gen_` followed by a 26-character ULID.'
    );
  });

  it('returns a clear error when the request is not retained', async () => {
    useRequest(null);
    useAttempts([]);
    client.setArgv('ai-gateway', 'logs', 'inspect', generationId);

    expect(await logs(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'It may be outside retention or belong to another team.'
    );
  });
});
