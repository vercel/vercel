import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LocalWorkspaceGateway } from '../../src/gateways/local-workspace';
import { liveLocalWorkspace } from '../../src/gateways/local-workspace';
import humanizePath from '../../src/util/humanize-path';
import { FakeLocalWorkspace } from '../fakes/fake-local-workspace';

/**
 * Contract shared by the fake and the live gateway. `setup` materializes the
 * given files in `cwd` and returns a workspace over them.
 */
function describeContract(
  name: string,
  setup: (cwd: string, files: Record<string, string>) => LocalWorkspaceGateway,
  makeCwd: () => { cwd: string; cleanup(): void }
) {
  describe(name, () => {
    let cwd: string;
    let cleanup: () => void;

    beforeEach(() => {
      ({ cwd, cleanup } = makeCwd());
    });

    afterEach(() => {
      cleanup();
    });

    it('reports a missing config with the searched path', async () => {
      const workspace = setup(cwd, {});

      await expect(workspace.readEarlyLocalConfig({ cwd })).resolves.toEqual({
        type: 'missing',
        searchedPaths: [humanizePath(join(cwd, 'vercel.json'))],
      });
    });

    it('reads vercel.json', async () => {
      const workspace = setup(cwd, {
        'vercel.json': JSON.stringify({ scope: 'acme' }),
      });

      await expect(
        workspace.readEarlyLocalConfig({ cwd })
      ).resolves.toMatchObject({ type: 'found', config: { scope: 'acme' } });
    });

    it('reports an unparseable vercel.json', async () => {
      const workspace = setup(cwd, { 'vercel.json': '{ not json' });

      await expect(
        workspace.readEarlyLocalConfig({ cwd })
      ).resolves.toMatchObject({
        type: 'error',
        error: {
          code: 'CANT_PARSE_JSON_FILE',
          details: { file: join(cwd, 'vercel.json') },
        },
      });
    });

    it('rejects a deprecated now.json', async () => {
      const workspace = setup(cwd, { 'now.json': '{}' });

      await expect(
        workspace.readEarlyLocalConfig({ cwd })
      ).resolves.toMatchObject({
        type: 'error',
        error: { code: 'DEPRECATED_NOW_JSON' },
      });
    });

    it('reports whether an entry exists', async () => {
      const workspace = setup(cwd, { 'vercel.json': '{}' });

      await expect(
        workspace.hasEntry({ cwd, name: 'vercel.json' })
      ).resolves.toBe(true);
      await expect(workspace.hasEntry({ cwd, name: 'nope' })).resolves.toBe(
        false
      );
    });
  });
}

describeContract(
  'FakeLocalWorkspace',
  (cwd, files) =>
    new FakeLocalWorkspace({
      files: Object.fromEntries(
        Object.entries(files).map(([name, content]) => {
          let value: Record<string, unknown> | 'invalid-json';
          try {
            value = JSON.parse(content);
          } catch {
            value = 'invalid-json';
          }
          return [join(cwd, name), value];
        })
      ),
    }),
  () => ({ cwd: resolve('/work'), cleanup: () => {} })
);

describeContract(
  'liveLocalWorkspace',
  (cwd, files) => {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(cwd, name), content);
    }
    return liveLocalWorkspace();
  },
  () => {
    const cwd = mkdtempSync(join(tmpdir(), 'vercel-cli-local-workspace-'));
    return {
      cwd,
      cleanup: () => rmSync(cwd, { recursive: true, force: true }),
    };
  }
);
