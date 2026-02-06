import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'rolldown';
import { plugin } from '../../cervel/plugin.js';
import { __dirname__filenameShim } from '../../cervel/rolldown.js';

// Find the project root (directory containing package.json)
function findProjectRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== '/' && dir !== '.') {
    if (existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return startDir;
}

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

  // Bundle with rolldown (only file:// URLs, skip node_modules)
  if (
    url.startsWith('file://') &&
    !bundled.has(url) &&
    !url.includes('/node_modules/')
  ) {
    bundled.add(url);
    const filePath = fileURLToPath(url);
    const fileDir = dirname(filePath);
    const projectRoot = findProjectRoot(fileDir);

    const result = await build({
      input: filePath,
      write: false,
      platform: 'node',
      cwd: projectRoot,
      plugins: [
        plugin({
          repoRootPath: projectRoot,
          outDir: fileDir,
          workPath: projectRoot,
          // Shim CJS imports for ESM output
          shimBareImports: true,
          context: { tracedPaths: new Set<string>() },
        }),
      ],
      output: {
        format: 'esm',
        banner: __dirname__filenameShim,
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
