import aiGateway from '../../../../src/commands/ai-gateway';
import { client } from '../../../mocks/client';

export const TEAM_ID = 'team_acme';
export const ENDPOINT_URL = 'https://security.example.com/hook';
export const HEADER_VALUE = 'test-header-value-123';
export const SIGNING_SECRET = 'whsec_dGVzdC1zaWduaW5nLXNlY3JldC12YWx1ZQ==';

export const savedConfig = {
  configured: true,
  endpointUrl: ENDPOINT_URL,
  enabled: false,
  mode: 'shadow',
  failureMode: 'open',
  timeoutMs: 5000,
  rolloutPercent: 100,
  updatedAt: 1795000000000,
  headers: { names: ['x-api-key'], updatedAt: 1795000000000 },
};

export const secretMetadata = {
  exists: true,
  secretId: 'c0ffee00-0000-4000-8000-000000000001',
  createdAt: 1795000000000,
  rotatedAt: null,
};

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, unknown>;
  body: unknown;
}

/** Runs `vercel ai-gateway inference-hooks …` in team acme. */
export function run(...args: string[]) {
  client.config.currentTeam = TEAM_ID;
  client.setArgv('ai-gateway', 'inference-hooks', ...args);
  return aiGateway(client);
}

/**
 * Serves the inference hooks routes. Each handler returns the status and
 * body to send; every request is recorded.
 */
export function useInferenceHooksApi(
  handlers: Partial<
    Record<
      | 'getConfig'
      | 'putConfig'
      | 'deleteConfig'
      | 'getSecret'
      | 'postSecret'
      | 'postTest',
      (body: any) => { status?: number; body?: unknown; headers?: object }
    >
  >
): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  const route = (name: keyof typeof handlers) => (req: any, res: any) => {
    requests.push({
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body,
    });
    const handler = handlers[name];
    if (!handler) {
      res.status(500).json({ error: { message: 'unexpected request' } });
      return;
    }
    const result = handler(req.body);
    for (const [key, value] of Object.entries(result.headers ?? {})) {
      res.setHeader(key, value);
    }
    res.status(result.status ?? 200);
    if (result.body === undefined) {
      res.end();
    } else {
      res.json(result.body);
    }
  };
  client.scenario.get('/ai-gateway/inference-hooks', route('getConfig'));
  client.scenario.put('/ai-gateway/inference-hooks', route('putConfig'));
  client.scenario.delete('/ai-gateway/inference-hooks', route('deleteConfig'));
  client.scenario.get(
    '/ai-gateway/inference-hooks/signing-secret',
    route('getSecret')
  );
  client.scenario.post(
    '/ai-gateway/inference-hooks/signing-secret',
    route('postSecret')
  );
  client.scenario.post('/ai-gateway/inference-hooks/test', route('postTest'));
  return requests;
}

export function apiError(status: number, code: string, message = 'Rejected') {
  return { status, body: { error: { code, message } } };
}

export function stdout(): string {
  return client.stdout.getFullOutput();
}

export function stderr(): string {
  return client.stderr.getFullOutput();
}

export function stdoutJson() {
  return JSON.parse(stdout());
}

/** The JSON error document: the last line of stderr. */
export function stderrJson() {
  const lines = stderr().trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

/** Every request was scoped by `teamId`, and none sent `ownerId`. */
export function expectTeamScoped(requests: RecordedRequest[]) {
  for (const request of requests) {
    if (request.query.teamId !== TEAM_ID || 'ownerId' in request.query) {
      throw new Error(
        `${request.method} ${request.path} was not scoped to the team`
      );
    }
    if (
      request.body &&
      typeof request.body === 'object' &&
      'ownerId' in request.body
    ) {
      throw new Error(`${request.method} ${request.path} sent ownerId`);
    }
  }
}
