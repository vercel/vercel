import path from 'node:path';
import { existsSync } from 'node:fs';
import {
  debug,
  normalizePath,
  type DetectEntrypointFn,
} from '@vercel/build-utils';
import {
  getCargoMetadata,
  realPath,
  resolveStandaloneBinary,
} from './lib/cargo';
import { createRustEnv } from './lib/compile';

/**
 * Resolve the source file of the binary a standalone Rust project deploys.
 *
 * Rust has no fixed entrypoint convention to scan for, so `cargo metadata` is
 * the source of truth and the configured entrypoint only disambiguates.
 */
export async function detectRustEntrypoint(
  workPath: string,
  configuredEntrypoint?: string
): Promise<string | null> {
  // An entrypoint that exists on disk wins, so the common case skips cargo.
  if (
    configuredEntrypoint?.endsWith('.rs') &&
    existsSync(path.join(workPath, configuredEntrypoint))
  ) {
    debug(`Using configured Rust entrypoint: ${configuredEntrypoint}`);
    return configuredEntrypoint;
  }

  try {
    const metadata = await getCargoMetadata({
      cwd: workPath,
      env: createRustEnv(),
    });
    const binary = resolveStandaloneBinary(
      metadata,
      configuredEntrypoint,
      workPath
    );
    // Entrypoints are posix-separated on every platform.
    const relative = normalizePath(
      path.relative(realPath(workPath), realPath(binary.srcPath))
    );
    debug(`Detected Rust entrypoint: ${relative} (bin "${binary.name}")`);
    return relative;
  } catch (err) {
    debug(`Failed to detect Rust entrypoint: ${err}`);
    return null;
  }
}

export const detectEntrypoint: DetectEntrypointFn = async ({ workPath }) => {
  const file = await detectRustEntrypoint(workPath);
  if (!file) return null;
  return { kind: 'file', entrypoint: file };
};
