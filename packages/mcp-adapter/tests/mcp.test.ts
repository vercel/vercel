import { describe, it, expect } from 'vitest';
import { calculateEndpoints } from '../src/next/mcp-api-handler';

describe('calculateEndpoints', () => {
  it('derives all endpoints from basePath', () => {
    const result = calculateEndpoints({ basePath: '/api/foo' });
    expect(result).toEqual({
      streamableHttpEndpoint: '/api/foo/mcp',
      sseEndpoint: '/api/foo/sse',
      sseMessageEndpoint: '/api/foo/message',
    });
  });

  it('derives endpoints from basePath with trailing slash', () => {
    const result = calculateEndpoints({ basePath: '/api/bar/' });
    expect(result).toEqual({
      streamableHttpEndpoint: '/api/bar/mcp',
      sseEndpoint: '/api/bar/sse',
      sseMessageEndpoint: '/api/bar/message',
    });
  });

  it('uses explicit endpoints if basePath is not provided', () => {
    const result = calculateEndpoints({
      streamableHttpEndpoint: '/explicit/mcp',
      sseEndpoint: '/explicit/sse',
      sseMessageEndpoint: '/explicit/message',
    });
    expect(result).toEqual({
      streamableHttpEndpoint: '/explicit/mcp',
      sseEndpoint: '/explicit/sse',
      sseMessageEndpoint: '/explicit/message',
    });
  });

  it('prefers basePath over explicit endpoints', () => {
    const result = calculateEndpoints({
      basePath: '/api/baz',
      streamableHttpEndpoint: '/should/not/use/mcp',
      sseEndpoint: '/should/not/use/sse',
      sseMessageEndpoint: '/should/not/use/message',
    });
    expect(result).toEqual({
      streamableHttpEndpoint: '/api/baz/mcp',
      sseEndpoint: '/api/baz/sse',
      sseMessageEndpoint: '/api/baz/message',
    });
  });

  it('handles missing values gracefully', () => {
    const result = calculateEndpoints({});
    expect(result).toEqual({
      streamableHttpEndpoint: '/mcp',
      sseEndpoint: '/sse',
      sseMessageEndpoint: '/message',
    });
  });

  it('handles empty basePath', () => {
    const result = calculateEndpoints({ basePath: '' });
    expect(result).toEqual({
      streamableHttpEndpoint: '/mcp',
      sseEndpoint: '/sse',
      sseMessageEndpoint: '/message',
    });
  });

  it('handles basePath as just "/"', () => {
    const result = calculateEndpoints({ basePath: '/' });
    expect(result).toEqual({
      streamableHttpEndpoint: '/mcp',
      sseEndpoint: '/sse',
      sseMessageEndpoint: '/message',
    });
  });

  it('falls back to explicit endpoints when basePath is undefined', () => {
    const result = calculateEndpoints({
      basePath: undefined,
      streamableHttpEndpoint: '/explicit/mcp',
      sseEndpoint: '/explicit/sse',
      sseMessageEndpoint: '/explicit/message',
    });
    expect(result).toEqual({
      streamableHttpEndpoint: '/explicit/mcp',
      sseEndpoint: '/explicit/sse',
      sseMessageEndpoint: '/explicit/message',
    });
  });
});
