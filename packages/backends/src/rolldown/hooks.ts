import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { existsSync, statSync, realpathSync } from 'node:fs';

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
};

const repoRootPath = getRequiredEnv('VERCEL_INTROSPECTION_REPO_ROOT_PATH');
const handlerPath = getRequiredEnv('VERCEL_INTROSPECTION_HANDLER');
const handlerBuilt = getRequiredEnv('VERCEL_INTROSPECTION_HANDLER_BUILT');
const tmpDir = realpathSync(getRequiredEnv('VERCEL_INTROSPECTION_TMP_DIR'));

export async function resolve(
  specifier: string,
  context: any,
  nextResolve: any
) {
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
    return nextResolve(specifier, {
      ...context,
      parentURL: pathToFileURL(mappedParent).href,
    });
  }

  return nextResolve(specifier, context);
}

export async function load(
  url: string,
  context: any,
  nextLoad: (url: string, context: any) => Promise<any>
) {
  return nextLoad(url, context);
}
