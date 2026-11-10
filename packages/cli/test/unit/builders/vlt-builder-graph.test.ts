import { brotliCompress } from 'node:zlib';
import { promisify } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEmbeddedBuilderGraphs } from '../../../src/builders/vlt-builder-graph';

const compress = promisify(brotliCompress);

async function loadGraphModule() {
  return import('../../../src/builders/vlt-builder-graph');
}

const graphs = {
  schemaVersion: 1,
  builders: {
    '@vercel/node': {
      hash: 'a'.repeat(64),
      name: '@vercel/node',
      version: '1.0.0',
      manifest: {},
      lockfile: {},
    },
  },
} as never;

describe('embedded vlt Builder index loader', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reads the index without loading the graphs', async () => {
    const { loadEmbeddedBuilderIndex } = await loadGraphModule();
    const loadGraphs = vi.fn();
    const readIndex = vi.fn(async () =>
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          builders: { '@vercel/node': { hash: 'h', version: '1.0.0' } },
        })
      )
    );

    const first = await loadEmbeddedBuilderIndex(readIndex, loadGraphs);
    const second = await loadEmbeddedBuilderIndex(readIndex, loadGraphs);

    expect(first.builders['@vercel/node']).toEqual({
      hash: 'h',
      version: '1.0.0',
    });
    expect(second).toBe(first);
    expect(readIndex).toHaveBeenCalledTimes(1);
    expect(loadGraphs).not.toHaveBeenCalled();
  });

  it('derives the index from the graphs when the index file is missing', async () => {
    const { loadEmbeddedBuilderIndex } = await loadGraphModule();
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });

    const index = await loadEmbeddedBuilderIndex(
      async () => {
        throw missing;
      },
      async () => graphs
    );

    expect(index).toEqual({
      schemaVersion: 1,
      builders: { '@vercel/node': { hash: 'a'.repeat(64), version: '1.0.0' } },
    });
  });

  it('rejects an invalid index and retries on the next call', async () => {
    const { loadEmbeddedBuilderIndex } = await loadGraphModule();
    const readIndex = vi
      .fn()
      .mockResolvedValueOnce(Buffer.from('{"schemaVersion":2}'))
      .mockResolvedValueOnce(
        Buffer.from(JSON.stringify({ schemaVersion: 1, builders: {} }))
      );

    await expect(loadEmbeddedBuilderIndex(readIndex)).rejects.toThrow(
      'Could not load the embedded vlt Builder index.'
    );
    await expect(loadEmbeddedBuilderIndex(readIndex)).resolves.toEqual({
      schemaVersion: 1,
      builders: {},
    });
  });
});

describe('embedded vlt Builder graph loader', () => {
  it('decompresses and caches the graph asset', async () => {
    const readGraph = vi.fn(async () =>
      compress(
        new Uint8Array(
          Buffer.from(
            JSON.stringify({
              schemaVersion: 1,
              builders: {},
            })
          )
        )
      )
    );

    const first = await loadEmbeddedBuilderGraphs(readGraph);
    const second = await loadEmbeddedBuilderGraphs(readGraph);

    expect(first).toBe(second);
    expect(readGraph).toHaveBeenCalledTimes(1);
  });
});
