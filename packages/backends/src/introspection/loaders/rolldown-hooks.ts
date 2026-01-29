import { build } from 'rolldown';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

let honoUrl: string | null = null;
let expressUrl: string | null = null;

// Cache bundled chunks by URL
const chunkCache = new Map<string, string>();

// Track which entry files have been bundled
const bundled = new Set<string>();

export async function resolve(
  specifier: string,
  context: { parentURL?: string },
  nextResolve: (
    specifier: string,
    context: { parentURL?: string }
  ) => Promise<{ url: string }>
) {
  // Check if this is a relative import that might be a cached chunk
  if (context.parentURL && specifier.startsWith('./')) {
    const parentPath = fileURLToPath(context.parentURL);
    const parentDir = dirname(parentPath);
    const resolvedUrl = pathToFileURL(join(parentDir, specifier)).href;

    if (chunkCache.has(resolvedUrl)) {
      return { url: resolvedUrl, shortCircuit: true };
    }
  }

  const result = await nextResolve(specifier, context);

  if (specifier === 'hono') {
    honoUrl = result.url;
  } else if (specifier === 'express') {
    expressUrl = result.url;
  }

  return result;
}

export async function load(
  url: string,
  context: { format?: string },
  nextLoad: (
    url: string,
    context: { format?: string }
  ) => Promise<{ format: string; source: string | Buffer }>
) {
  // Handle framework shimming for Hono
  if (honoUrl === url) {
    const pathToHonoExtract = new URL('../hono.mjs', import.meta.url);
    const shimSource = `
import { handle } from ${JSON.stringify(pathToHonoExtract.toString())};
import * as originalHono from ${JSON.stringify(url + '?original')};

export * from ${JSON.stringify(url + '?original')};
export const Hono = handle(originalHono);
`;
    return { format: 'module', source: shimSource, shortCircuit: true };
  }

  // Handle framework shimming for Express
  if (expressUrl === url) {
    const pathToExpressExtract = new URL('../express.mjs', import.meta.url);
    const shimSource = `
import { handle } from ${JSON.stringify(pathToExpressExtract.toString())};
import originalExpress from ${JSON.stringify(url + '?original')};

const extendedExpress = handle(originalExpress);

export * from ${JSON.stringify(url + '?original')};
export default extendedExpress;
`;
    return { format: 'module', source: shimSource, shortCircuit: true };
  }

  // Handle ?original redirect
  if (url.endsWith('?original')) {
    return nextLoad(url, context);
  }

  // Check chunk cache first
  const cached = chunkCache.get(url);
  if (cached) {
    return { format: 'module', source: cached, shortCircuit: true };
  }

  // Bundle with rolldown (only file:// URLs)
  if (url.startsWith('file://') && !bundled.has(url)) {
    bundled.add(url);
    const filePath = fileURLToPath(url);
    const fileDir = dirname(filePath);

    const result = await build({
      input: filePath,
      write: false,
      platform: 'node',
      // Only keep hono/express external (for shims) and node built-ins
      // Bundle everything else so rolldown handles CJS interop
      external: id =>
        id === 'hono' ||
        id === 'express' ||
        id.startsWith('node:') ||
        /^(fs|path|os|crypto|util|events|stream|http|https|url|querystring|buffer|assert|child_process|cluster|dgram|dns|domain|net|readline|repl|tls|tty|v8|vm|zlib)$/.test(
          id
        ),
      output: {
        banner: `
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname_fn } from 'node:path';
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_fn(__filename);
`,
      },
    });

    // Cache all output chunks
    for (const chunk of result.output) {
      if (chunk.type === 'chunk') {
        const chunkUrl = pathToFileURL(join(fileDir, chunk.fileName)).href;
        chunkCache.set(chunkUrl, chunk.code);
      }
    }

    // Return the entry chunk
    const entryChunk = result.output.find(
      chunk => chunk.type === 'chunk' && chunk.isEntry
    );
    if (entryChunk && entryChunk.type === 'chunk') {
      return { format: 'module', source: entryChunk.code, shortCircuit: true };
    }

    // Fallback to first chunk
    return {
      format: 'module',
      source: result.output[0].code,
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
}
