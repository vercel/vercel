import { client } from './client';
import type {
  CreateDrainRequestBody,
  Drain,
  TestDrainRequestBody,
  UpdateDrainRequestBody,
} from '../../src/util/drains/types';

export const defaultDrain: Drain = {
  id: 'drn_1',
  name: 'prod-logs',
  createdAt: 1600000000000,
  updatedAt: 1600000000000,
  ownerId: 'team_dummy',
  status: 'enabled',
  schemas: { log: { version: 'v1' } },
  delivery: {
    type: 'http',
    endpoint: 'https://logs.example.com',
    encoding: 'ndjson',
    headers: { Authorization: 'Bearer sk_do_not_leak' },
    secret: 'whsec_do_not_leak',
  },
  source: { kind: 'self-served' },
};

// Registers the happy-path list/find/delete/patch routes. Error cases register
// their own handlers instead of calling this.
export function useDrains(drains: Drain[] = [defaultDrain]) {
  client.scenario.get('/v1/drains', (_req, res) => {
    res.json({ drains });
  });

  for (const drain of drains) {
    client.scenario.get(`/v1/drains/${drain.id}`, (_req, res) => {
      res.json(drain);
    });
    client.scenario.delete(`/v1/drains/${drain.id}`, (_req, res) => {
      res.json({});
    });
    client.scenario.patch(`/v1/drains/${drain.id}`, (req, res) => {
      // Echo the drain merged with the PATCH body the way the server would:
      // `projects` is a request-only field and never appears on the resource.
      const { projects: _projects, ...rest } = (req.body ??
        {}) as UpdateDrainRequestBody;
      res.json({ ...drain, ...rest });
    });
  }

  return drains;
}

// Registers a happy-path POST /v1/drains route that echoes the request body
// back as a created drain. Returns a recorder holding the last request body.
export function useCreateDrain(id = 'drn_new') {
  const recorder: { body?: CreateDrainRequestBody } = {};
  client.scenario.post('/v1/drains', (req, res) => {
    recorder.body = req.body as CreateDrainRequestBody;
    const { projects: _projects, ...rest } = recorder.body;
    res.json({
      id,
      createdAt: 1600000000000,
      updatedAt: 1600000000000,
      ownerId: 'team_dummy',
      status: 'enabled',
      source: { kind: 'self-served' },
      ...rest,
    });
  });
  return recorder;
}

// Registers a POST /v1/drains/test route. Pass a failure object to simulate a
// failed sample delivery ({} means success). Returns a request-body recorder.
export function useTestDrain(
  result: { status?: string; error?: string; endpoint?: string } = {}
) {
  const recorder: { body?: TestDrainRequestBody } = {};
  client.scenario.post('/v1/drains/test', (req, res) => {
    recorder.body = req.body as TestDrainRequestBody;
    res.json(result);
  });
  return recorder;
}
