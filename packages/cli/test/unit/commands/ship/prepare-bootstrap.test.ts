import { describe, beforeEach, expect, it } from 'vitest';
import { mkdirpSync, readFileSync, writeFileSync, existsSync } from 'fs-extra';
import { dirname, join } from 'node:path';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { prepareHarnessBootstrap } from '../../../../src/commands/ship/prepare-bootstrap';

/**
 * The implicit local workspace roots the sandbox at the working directory, so
 * the bootstrap directory sits inside the project.
 */
function bootstrapConfigPath(workspace: string, harnessId: string): string {
  return join(
    workspace,
    '.harness-bootstrap',
    harnessId,
    'pnpm-workspace.yaml'
  );
}

describe('ship prepareHarnessBootstrap', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = join(setupTmpDir(), 'project');
    mkdirpSync(workspace);
  });

  it('pre-authorizes builds when no config exists', async () => {
    await prepareHarnessBootstrap({ harnessId: 'claude-code', workspace });

    const configPath = bootstrapConfigPath(workspace, 'claude-code');
    expect(readFileSync(configPath, 'utf-8')).toContain(
      'dangerouslyAllowAllBuilds: true'
    );
  });

  it('confines its writes to the harness-owned directory', async () => {
    await prepareHarnessBootstrap({ harnessId: 'claude-code', workspace });

    // Inside the project, but only ever under `.harness-bootstrap`, which the
    // harness owns and keeps out of git.
    expect(existsSync(join(workspace, '.harness-bootstrap'))).toBe(true);
    expect(existsSync(join(workspace, 'pnpm-workspace.yaml'))).toBe(false);
    expect(existsSync(join(dirname(workspace), '.harness-bootstrap'))).toBe(
      false
    );
  });

  it('replaces the placeholder pnpm writes when it refuses a build', async () => {
    const configPath = bootstrapConfigPath(workspace, 'claude-code');
    mkdirpSync(dirname(configPath));
    writeFileSync(
      configPath,
      "allowBuilds:\n  '@anthropic-ai/claude-code': set this to true or false\n",
      'utf-8'
    );

    await prepareHarnessBootstrap({ harnessId: 'claude-code', workspace });

    const contents = readFileSync(configPath, 'utf-8');
    expect(contents).toContain('dangerouslyAllowAllBuilds: true');
    expect(contents).not.toContain('set this to true or false');
  });

  it('leaves an existing valid config untouched', async () => {
    const configPath = bootstrapConfigPath(workspace, 'claude-code');
    mkdirpSync(dirname(configPath));
    const custom = "allowBuilds:\n  '@anthropic-ai/claude-code': true\n";
    writeFileSync(configPath, custom, 'utf-8');

    await prepareHarnessBootstrap({ harnessId: 'claude-code', workspace });

    expect(readFileSync(configPath, 'utf-8')).toBe(custom);
  });

  it('does nothing for harnesses that do not bootstrap with pnpm', async () => {
    await prepareHarnessBootstrap({ harnessId: 'codex', workspace });

    expect(existsSync(bootstrapConfigPath(workspace, 'codex'))).toBe(false);
  });

  it('never throws when the location is not writable', async () => {
    await expect(
      prepareHarnessBootstrap({
        harnessId: 'claude-code',
        workspace: '/proc/nonexistent/project',
      })
    ).resolves.toBeUndefined();
  });
});
