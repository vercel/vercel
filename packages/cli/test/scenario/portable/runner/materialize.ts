/** Materializes `world.local` into sandbox files; null means absent. */
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ScenarioSandbox } from '../../harness/run-cli';
import type { LocalState } from '../model/schemas';

/** Sandbox-relative file for each local-state key. */
export const LOCAL_STATE_FILES: Record<keyof LocalState, string> = {
  credentials: 'global-config/auth.json',
  settings: 'global-config/config.json',
  projectLink: 'workspace/.vercel/project.json',
  repoLink: 'workspace/.vercel/repo.json',
};

/**
 * Files the CLI writes for its own bookkeeping, ignored on read-back. Their
 * contents are random or time-based even with telemetry disabled.
 */
export const IMPLEMENTATION_PRIVATE_FILES = [
  'global-config/telemetry-device.json',
  'global-config/telemetry-session.json',
];

export function materializeLocal(
  sandbox: ScenarioSandbox,
  local: LocalState
): void {
  for (const [key, file] of Object.entries(LOCAL_STATE_FILES)) {
    const value = local[key as keyof LocalState];
    if (value === null) {
      rmSync(join(sandbox.root, ...file.split('/')), { force: true });
    } else {
      sandbox.writeJson(file, value);
    }
  }
}
