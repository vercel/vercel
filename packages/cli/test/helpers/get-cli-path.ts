import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resolve once per suite so CLI calls and generated fixture scripts use the same executable. */
export function getCliPath(): string {
  const binaryPath = process.env.VERCEL_CLI_TEST_BINARY;
  return binaryPath
    ? resolve(binaryPath)
    : fileURLToPath(new URL('../../scripts/start.js', import.meta.url));
}
