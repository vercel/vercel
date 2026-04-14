import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import { mkdirp, writeFile } from 'fs-extra';
import { createIsolatedProject, placeBuilder, runVercelBuild } from './helpers';

import vercelNodePkg from '@vercel/node/package.json';

// These tests run the built CLI binary against isolated temp dirs.
// They require `pnpm build --filter vercel` to have been run first.
vi.setConfig({ testTimeout: 60_000 });

describe('builder resolution (e2e)', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const cleanup of cleanups) {
      await cleanup();
    }
    cleanups.length = 0;
  });

  it('should resolve @vercel/node from CLI bundle', async () => {
    const project = await createIsolatedProject();
    cleanups.push(project.cleanup);

    // Add an API route so @vercel/node gets detected
    await mkdirp(join(project.dir, 'api'));
    await writeFile(
      join(project.dir, 'api', 'index.js'),
      'export default function handler(req, res) { res.end("ok"); }\n'
    );

    const result = await runVercelBuild({ cwd: project.dir });

    expect(result.exitCode).toBe(0);

    // Should show the step-by-step resolution in debug output
    expect(result.combined).toContain(
      'Resolving "@vercel/node" (peerDep: none)'
    );
    expect(result.combined).toContain(
      '[resolve] "@vercel/node" step 3: trying CLI bundle'
    );
    expect(result.combined).toContain(
      `Found "@vercel/node@${vercelNodePkg.version}" in CLI bundle`
    );
    // The resolved builders string includes @vercel/static too
    expect(result.combined).toContain(
      `@vercel/node => ${vercelNodePkg.version}`
    );
  });

  it('should resolve builder from .vercel/builders cache', async () => {
    const project = await createIsolatedProject();
    cleanups.push(project.cleanup);

    // Add an API route that would normally use @vercel/node
    await mkdirp(join(project.dir, 'api'));
    await writeFile(
      join(project.dir, 'api', 'index.js'),
      'export default function handler(req, res) { res.end("ok"); }\n'
    );

    // Place a fake @vercel/node in the .vercel/builders cache.
    // We use a fake builder with the real version number so resolution succeeds.
    // The build itself will succeed since our fake builder returns empty output.
    await placeBuilder({
      name: '@vercel/node',
      version: vercelNodePkg.version,
      baseDir: join(project.dir, '.vercel', 'builders'),
    });

    const result = await runVercelBuild({ cwd: project.dir });

    // The build may fail because the fake builder doesn't produce real output,
    // but we only care about the resolution step here.
    expect(result.combined).toContain(
      `Found "@vercel/node@${vercelNodePkg.version}" in .vercel/builders`
    );
    // Should NOT reach step 3
    expect(result.combined).not.toContain(
      '"@vercel/node" step 3: trying CLI bundle'
    );
  });

  describe('peer dependency resolution (scaffolding)', () => {
    // These tests set up the scaffolding for when builders move to peerDependencies.
    // Currently the peer dep code path is a no-op since no builders are in peerDependencies.
    // When we move builders to peerDependencies, remove the .todo markers.

    it.todo(
      'should resolve builder from cwd node_modules when peerDep version matches'
      // When builders are in peerDependencies, this test should:
      // 1. Place the correct version of @vercel/node in project/node_modules/
      // 2. Run vc build --debug
      // 3. Assert: combined output contains 'in peer dependencies location (matches peerDep'
      // 4. Assert: combined output does NOT contain 'step 2: trying .vercel/builders'
    );

    it.todo(
      'should fall through when peer dep version does not match'
      // When builders are in peerDependencies, this test should:
      // 1. Place a WRONG version of @vercel/node in project/node_modules/
      // 2. Run vc build --debug
      // 3. Assert: combined output contains 'does not match peerDep'
      // 4. Assert: build still succeeds (falls through to CLI bundle)
    );

    it.todo(
      'should fall through when builder not found in cwd node_modules'
      // When builders are in peerDependencies, this test should:
      // 1. Don't place any builder in project/node_modules/
      // 2. Run vc build --debug
      // 3. Assert: combined output contains 'not found in peer dependencies location'
      // 4. Assert: build still succeeds (falls through to CLI bundle)
    );
  });
});
