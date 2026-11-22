import { brotliDecompress } from 'node:zlib';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  EmbeddedBuilderGraphs,
  EmbeddedBuilderIndex,
} from './vlt-builder-importer';

const decompress = promisify(brotliDecompress);
let embeddedGraphs: Promise<EmbeddedBuilderGraphs> | undefined;
let embeddedIndex: Promise<EmbeddedBuilderIndex> | undefined;

const GRAPH_FILE = 'builder-graph.json.br';
const INDEX_FILE = 'builder-index.json';

function defaultAssetPaths(file: string) {
  return [join(__dirname, file), join(__dirname, '..', 'builders', file)];
}

async function readDefaultAsset(file: string) {
  let lastError: unknown;
  for (const path of defaultAssetPaths(file)) {
    try {
      return await readFile(path);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * The full vlt graphs: every Builder's manifest and lockfile. Only needed to
 * install a Builder that is not already in the cache.
 */
export function loadEmbeddedBuilderGraphs(
  readGraph: () => Promise<Buffer> = () => readDefaultAsset(GRAPH_FILE)
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

export function createBuilderIndex(
  graphs: EmbeddedBuilderGraphs
): EmbeddedBuilderIndex {
  return {
    schemaVersion: 1,
    builders: Object.fromEntries(
      Object.entries(graphs.builders ?? {}).map(([name, { hash, version }]) => [
        name,
        { hash, version },
      ])
    ),
  };
}

/**
 * Each Builder's graph hash and version: all that importing an already
 * installed Builder needs. A binary without the index file derives it from
 * the full graphs.
 */
export function loadEmbeddedBuilderIndex(
  readIndex: () => Promise<Buffer> = () => readDefaultAsset(INDEX_FILE),
  loadGraphs: () => Promise<EmbeddedBuilderGraphs> = loadEmbeddedBuilderGraphs
): Promise<EmbeddedBuilderIndex> {
  embeddedIndex ??= (async () => {
    let raw: Buffer;
    try {
      raw = await readIndex();
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        embeddedIndex = undefined;
        throw new Error('Could not load the embedded vlt Builder index.', {
          cause: error,
        });
      }
      try {
        return createBuilderIndex(await loadGraphs());
      } catch (graphError) {
        embeddedIndex = undefined;
        throw graphError;
      }
    }
    try {
      const index = JSON.parse(raw.toString('utf8')) as EmbeddedBuilderIndex;
      if (
        index.schemaVersion !== 1 ||
        !index.builders ||
        typeof index.builders !== 'object'
      ) {
        throw new Error('invalid schema');
      }
      return index;
    } catch (error) {
      embeddedIndex = undefined;
      throw new Error('Could not load the embedded vlt Builder index.', {
        cause: error,
      });
    }
  })();
  return embeddedIndex;
}
