import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';
import runtimeAssetManifest from '../runtime-assets/manifest.json';
import getGlobalPathConfig from './config/global-path';
import pkg from './pkg';

type RuntimeAssetDefinition = {
  source: string;
  destination: string;
  executable?: boolean;
};

export type RuntimeAssetId = keyof typeof runtimeAssetManifest;

const runtimeAssets = runtimeAssetManifest as Record<
  RuntimeAssetId,
  RuntimeAssetDefinition
>;

export interface RuntimeAssetOptions {
  globalRoot?: string;
  version?: string;
}

/**
 * `~/.vercel/runtime-assets/<cli-version>` — files bundled with the CLI that
 * must exist on the real filesystem for external processes to consume.
 */
export function getRuntimeAssetsDir(
  version: string = pkg.version,
  globalRoot: string = getGlobalPathConfig()
): string {
  return join(globalRoot, 'runtime-assets', version);
}

/**
 * Materialize a declared runtime asset on the real filesystem and return its
 * path. The manifest owns both the bundled source path and intentional on-disk
 * name, so callers refer to assets by semantic ID instead of ad-hoc paths.
 */
export function materializeRuntimeAsset(
  id: RuntimeAssetId,
  options: RuntimeAssetOptions = {}
): string {
  const definition = runtimeAssets[id];
  if (!definition) {
    throw new Error(`Unknown runtime asset: ${String(id)}`);
  }

  const source = validateRelativePath(id, 'source', definition.source);
  const destination = validateRelativePath(
    id,
    'destination',
    definition.destination
  );
  const data = readRuntimeAsset(source);
  const destinationPath = join(
    getRuntimeAssetsDir(
      options.version ?? pkg.version,
      options.globalRoot ?? getGlobalPathConfig()
    ),
    destination
  );
  const destinationDir = dirname(destinationPath);
  const temporaryPath = `${destinationPath}.${process.pid}.${randomUUID()}.tmp`;

  mkdirSync(destinationDir, { recursive: true });

  // read+write instead of copyFileSync: in the standalone binary the source
  // lives in the SEA virtual filesystem, where reads are patched reliably but
  // cross-boundary copyfile (VFS -> real disk) is not.
  try {
    writeFileSync(
      temporaryPath,
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    );
    if (definition.executable) {
      chmodSync(temporaryPath, 0o755);
    }
    try {
      renameSync(temporaryPath, destinationPath);
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' && code !== 'EPERM') {
        throw error;
      }
      // Windows rename does not replace an existing destination. Fall back to
      // remove+rename there; POSIX keeps the atomic replacement path above.
      rmSync(destinationPath, { force: true });
      renameSync(temporaryPath, destinationPath);
    }
  } finally {
    rmSync(temporaryPath, { force: true });
  }

  return destinationPath;
}

export function readRuntimeAsset(
  source: string,
  moduleDir: string = __dirname
): Buffer {
  const candidates = [
    // Built root entry points: dist/*.js -> dist/runtime-assets/...
    join(moduleDir, 'runtime-assets', source),
    // Source and built chunk layouts: src/util/*.ts or dist/chunks/*.js.
    join(moduleDir, '..', 'runtime-assets', source),
    // Built priority commands: dist/commands/<command>/index.js.
    join(moduleDir, '..', '..', 'runtime-assets', source),
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError;
}

function validateRelativePath(
  id: string,
  field: 'source' | 'destination',
  value: string
): string {
  const normalized = normalize(value);
  if (
    !value ||
    isAbsolute(value) ||
    normalized === '..' ||
    normalized.startsWith(`..${sep}`)
  ) {
    throw new Error(
      `Runtime asset "${id}" has an invalid ${field} path: ${JSON.stringify(value)}`
    );
  }
  return normalized;
}
