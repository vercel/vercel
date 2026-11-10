import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
import {
  ISOLATED_DIR_PREFIX,
  removeIsolatedDir,
} from './test/helpers/remove-isolated-dir';

declare module 'vitest' {
  export interface ProvidedContext {
    vercelCliTestRoot: string;
  }
}

// Runs once in the main vitest process. `vitest.setup.mts` creates one
// isolated global config dir per test file under this root. Tearing the root
// down here also removes dirs that per-file `afterAll` hooks never clean up,
// such as files vitest skips (only `it.todo`) or workers that were killed.
export default function setup(project: TestProject) {
  const root = mkdtempSync(join(tmpdir(), ISOLATED_DIR_PREFIX));
  project.provide('vercelCliTestRoot', root);
  return () => {
    removeIsolatedDir(root);
  };
}
