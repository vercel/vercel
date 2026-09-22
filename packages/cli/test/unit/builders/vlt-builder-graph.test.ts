import { brotliCompress } from 'node:zlib';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { loadEmbeddedBuilderGraphs } from '../../../src/builders/vlt-builder-graph';

const compress = promisify(brotliCompress);

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
