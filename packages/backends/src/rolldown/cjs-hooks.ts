/**
 * CJS preload script that intercepts require() calls.
 * - Check tmpDir first for files
 * - Map bare specifiers from tmpDir to repoRootPath
 */

import Module from 'node:module';
import path from 'node:path';
import { existsSync, statSync, realpathSync } from 'node:fs';

const repoRootPath = process.env.VERCEL_INTROSPECTION_REPO_ROOT_PATH;
const tmpDirEnv = process.env.VERCEL_INTROSPECTION_TMP_DIR;

if (!repoRootPath || !tmpDirEnv) {
  throw new Error(
    'VERCEL_INTROSPECTION_REPO_ROOT_PATH and VERCEL_INTROSPECTION_TMP_DIR must be set'
  );
}

const tmpDir = realpathSync(tmpDirEnv);

const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (
  request: string,
  parent: { filename?: string; paths?: string[] } | null,
  isMain: boolean,
  options?: any
): string {
  // For relative paths, check if it exists as a file first
  if (request.startsWith('.') && parent?.filename) {
    const parentDir = path.dirname(parent.filename);
    const resolvedPath = path.resolve(parentDir, request);

    if (existsSync(resolvedPath) && statSync(resolvedPath).isFile()) {
      return resolvedPath;
    }
  }

  // For bare specifiers from tmpDir, resolve from repoRootPath
  if (
    !request.startsWith('.') &&
    !request.startsWith('/') &&
    parent?.filename?.startsWith(tmpDir)
  ) {
    const relativeToTmp = path.relative(tmpDir, parent.filename);
    const mappedParentPath = path.join(repoRootPath, relativeToTmp);

    const fakeParent = {
      ...parent,
      filename: mappedParentPath,
      paths: (Module as any)._nodeModulePaths(path.dirname(mappedParentPath)),
    };

    return originalResolveFilename.call(
      this,
      request,
      fakeParent,
      isMain,
      options
    );
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};
