import { brotliDecompress } from 'node:zlib';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EmbeddedBuilderGraphs } from './vlt-builder-importer';

const decompress = promisify(brotliDecompress);
let embeddedGraphs: Promise<EmbeddedBuilderGraphs> | undefined;

function defaultGraphPaths() {
  return [
    join(__dirname, 'builder-graph.json.br'),
    join(__dirname, '..', 'builders', 'builder-graph.json.br'),
  ];
}

async function readDefaultGraph() {
  let lastError: unknown;
  for (const path of defaultGraphPaths()) {
    try {
      return await readFile(path);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function loadEmbeddedBuilderGraphs(
  readGraph: () => Promise<Buffer> = readDefaultGraph
): Promise<EmbeddedBuilderGraphs> {
  embeddedGraphs ??= (async () => {
    try {
      const compressed = await readGraph();
      const graphs = JSON.parse(
        (await decompress(new Uint8Array(compressed))).toString('utf8')
      ) as EmbeddedBuilderGraphs;
      if (
        graphs.schemaVersion !== 1 ||
        !graphs.builders ||
        typeof graphs.builders !== 'object'
      ) {
        throw new Error('invalid schema');
      }
      return graphs;
    } catch (error) {
      embeddedGraphs = undefined;
      throw new Error('Could not load the embedded vlt Builder graphs.', {
        cause: error,
      });
    }
  })();
  return embeddedGraphs;
}
