import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { existsSync, statSync, realpathSync } from 'node:fs';

// Node.js loader hook types
interface ResolveContext {
  parentURL?: string;
  conditions?: string[];
  importAttributes?: Record<string, string>;
}

interface ResolveResult {
  url: string;
  shortCircuit?: boolean;
  format?: string;
}

interface LoadContext {
  format?: string;
  importAttributes?: Record<string, string>;
}

interface LoadResult {
  format: string;
  source?: string | Buffer;
  shortCircuit?: boolean;
}

type NextResolve = (
  specifier: string,
  context: ResolveContext
) => Promise<ResolveResult>;

type NextLoad = (url: string, context: LoadContext) => Promise<LoadResult>;

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
};

const repoRootPath = getRequiredEnv('VERCEL_INTROSPECTION_REPO_ROOT_PATH');
const handlerPath = getRequiredEnv('VERCEL_INTROSPECTION_HANDLER');
const handlerBuilt = getRequiredEnv('VERCEL_INTROSPECTION_HANDLER_BUILT');
const tmpDir = realpathSync(getRequiredEnv('VERCEL_INTROSPECTION_TMP_DIR'));

// Track framework URLs for shimming
let honoUrl: string | null = null;
let expressUrl: string | null = null;

export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve
): Promise<ResolveResult> {
  let specifierAsPath: string | null = null;
  try {
    specifierAsPath = fileURLToPath(specifier);
  } catch {
    //
  }

  // Redirect the original handler to the built handler in tmpDir
  if (specifierAsPath === handlerPath) {
    const builtPath = join(tmpDir, handlerBuilt);
    return { url: pathToFileURL(builtPath).href, shortCircuit: true };
  }

  // For relative imports, check if it exists as a file first
  if (specifier.startsWith('.') && context.parentURL) {
    const parentPath = fileURLToPath(context.parentURL);
    const resolvedPath = join(dirname(parentPath), specifier);

    if (existsSync(resolvedPath) && statSync(resolvedPath).isFile()) {
      return { url: pathToFileURL(resolvedPath).href, shortCircuit: true };
    }
  }

  // For bare specifiers, resolve from repoRootPath
  if (
    !specifier.startsWith('.') &&
    !specifier.startsWith('/') &&
    !specifier.startsWith('file:') &&
    context.parentURL
  ) {
    const parentPath = fileURLToPath(context.parentURL);
    const relativeToTmp = relative(tmpDir, parentPath);
    const mappedParent = join(repoRootPath, relativeToTmp);
    const result = await nextResolve(specifier, {
      ...context,
      parentURL: pathToFileURL(mappedParent).href,
    });

    // Track hono/express URLs for shimming in load hook
    if (specifier === 'hono') {
      honoUrl = result.url;
    } else if (specifier === 'express') {
      expressUrl = result.url;
    }

    return result;
  }

  return nextResolve(specifier, context);
}

export async function load(
  url: string,
  context: LoadContext,
  nextLoad: NextLoad
): Promise<LoadResult> {
  // Handle framework shimming for Hono
  if (honoUrl === url) {
    const pathToHonoExtract = new URL(
      '../introspection/hono.mjs',
      import.meta.url
    );
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
    const pathToExpressExtract = new URL(
      '../introspection/express.mjs',
      import.meta.url
    );
    const shimSource = `
import { handle } from ${JSON.stringify(pathToExpressExtract.toString())};
import originalExpress from ${JSON.stringify(url + '?original')};

const extendedExpress = handle(originalExpress);

export * from ${JSON.stringify(url + '?original')};
export default extendedExpress;
`;
    return { format: 'module', source: shimSource, shortCircuit: true };
  }

  // Handle ?original redirect - strip the query and load normally
  if (url.endsWith('?original')) {
    return nextLoad(url, context);
  }

  return nextLoad(url, context);
}
