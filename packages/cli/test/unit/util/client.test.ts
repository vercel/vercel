import { describe, expect, it, vi } from 'vitest';
import { client } from '../../mocks/client';
import { Agent } from 'undici';

describe('Client', () => {
  describe('fetch()', () => {
    it('should pass the dispatcher to fetch', async () => {
      const dispatcher = new Agent();
      client.dispatcher = dispatcher;

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      client.scenario.get('/v2/test', (_req, res) => {
        res.json({ ok: true });
      });

      try {
        await client.fetch('/v2/test');

        expect(fetchSpy).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ dispatcher })
        );
      } finally {
        fetchSpy.mockRestore();
        client.dispatcher = undefined;
      }
    });

    it('should not include dispatcher when not set', async () => {
      client.dispatcher = undefined;
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      client.scenario.get('/v2/test2', (_req, res) => {
        res.json({ ok: true });
      });

      try {
        await client.fetch('/v2/test2');

        const callArgs = fetchSpy.mock.calls[0][1] as Record<string, unknown>;
        expect(callArgs.dispatcher).toBeUndefined();
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});
