import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

// Capture process-derived values before commands can load project-controlled
// dotenv files. Update detection and installation must not execute binaries,
// inherit settings, or select a working directory introduced after CLI startup.
export const trustedUpgradeEnvironment: NodeJS.ProcessEnv = Object.freeze({
  ...process.env,
});
export const trustedUpgradeDirectory = resolve(tmpdir());
