import { describe, expect, it } from 'vitest';
import { substituteOrigin, type Json } from './portable/model/json';
import {
  loadFaultsCatalog,
  loadManifest,
  loadOperationsCatalog,
  loadVector,
} from './portable/runner/load';
import { startWorldApi } from './portable/runner/world-api';

// Runs the generated conformance vectors against the TS world-driven fake API.
const manifest = loadManifest();
const catalog = {
  operations: loadOperationsCatalog(),
  faults: loadFaultsCatalog(),
};

describe('portable fake API conformance vectors', () => {
  for (const entry of manifest.vectors) {
    it(entry.id, async () => {
      const vector = loadVector(entry.path);
      const { api, worldApi } = await startWorldApi(
        vector.world,
        vector.conditions,
        catalog
      );
      try {
        const { request } = vector;
        const url = new URL(request.path, api.origin);
        for (const [key, value] of Object.entries(request.query)) {
          url.searchParams.set(key, value);
        }
        const headers: Record<string, string> = {};
        if (request.headers.authorization !== undefined) {
          headers.authorization = request.headers.authorization;
        }
        let body: string | undefined;
        if (request.body !== undefined) {
          headers['content-type'] = 'application/x-www-form-urlencoded';
          body = new URLSearchParams(request.body).toString();
        }

        const response = await fetch(url, {
          method: request.method,
          headers,
          ...(body === undefined ? {} : { body }),
        });

        expect(response.status).toBe(vector.expect.status);
        expect(await response.json()).toEqual(
          substituteOrigin(vector.expect.json as Json, api.origin)
        );
        expect(worldApi.calls.map(call => call.entry)).toEqual(
          vector.expect.operation === null ? [] : [vector.expect.operation]
        );
        // Vectors never mutate the world.
        expect(worldApi.server).toEqual(vector.world.server);
      } finally {
        await api.close();
      }
    });
  }
});
