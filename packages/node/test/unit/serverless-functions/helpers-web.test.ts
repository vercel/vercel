import { describe, it, expect, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { createWebExportsHandler } from '../../../src/serverless-functions/helpers-web';

describe('serverless-functions/helpers-web', () => {
  it('returns 405 for unsupported methods', () => {
    const getWebExportsHandler = createWebExportsHandler({
      waitUntil: () => {},
    } as any);

    const handler = getWebExportsHandler(
      {
        GET: () => new Response('ok'),
      },
      ['GET']
    );

    const end = vi.fn();
    const response = {
      statusCode: 200,
      end,
    } as unknown as ServerResponse;

    expect(() =>
      handler(
        {
          method: 'CONNECT',
        } as IncomingMessage,
        response
      )
    ).not.toThrow();
    expect(response.statusCode).toBe(405);
    expect(end).toHaveBeenCalled();
  });
});
