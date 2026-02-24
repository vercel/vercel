import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { destroy, getProjectModeVariantsFromEnv, setup } from './hooks';
import type { EvalRunContext } from './hooks';

function createSandboxDir(withLinkedProject: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'cli-evals-hooks-'));
  if (withLinkedProject) {
    const vercelDir = join(dir, '.vercel');
    mkdirSync(vercelDir, { recursive: true });
    writeFileSync(join(vercelDir, 'project.json'), '{}', 'utf8');
  }
  return dir;
}

describe('CLI evals setup/destroy hooks', () => {
  it('resolves projectMode=auto to linked-project when a project is linked', async () => {
    const sandbox = createSandboxDir(true);
    const context: EvalRunContext = {
      cwd: sandbox,
      sandboxProjectDir: sandbox,
      projectMode: 'auto',
    };

    const result = await setup(context);

    expect(result).toEqual({
      resolvedProjectMode: 'linked-project',
      hasLinkedProject: true,
    });

    await destroy(context, result);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it('resolves projectMode=auto to no-linked-project when no project is linked', async () => {
    const sandbox = createSandboxDir(false);
    const context: EvalRunContext = {
      cwd: sandbox,
      sandboxProjectDir: sandbox,
      projectMode: 'auto',
    };

    const result = await setup(context);

    expect(result).toEqual({
      resolvedProjectMode: 'no-linked-project',
      hasLinkedProject: false,
    });

    await destroy(context, result);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it('throws when projectMode=linked-project but no linked project is present', async () => {
    const sandbox = createSandboxDir(false);
    const context: EvalRunContext = {
      cwd: sandbox,
      sandboxProjectDir: sandbox,
      projectMode: 'linked-project',
    };

    await expect(setup(context)).rejects.toThrow(/expected a linked project/i);

    rmSync(sandbox, { recursive: true, force: true });
  });
});

describe('CLI evals project-mode matrix', () => {
  it('returns a default variant when env is unset', () => {
    delete process.env.CLI_EVAL_PROJECT_MODES;
    const variants = getProjectModeVariantsFromEnv('auto');
    expect(variants).toEqual([{ id: 'default', projectMode: 'auto' }]);
  });

  it('parses multiple valid project modes from env', () => {
    process.env.CLI_EVAL_PROJECT_MODES = 'linked-project,no-linked-project';
    const variants = getProjectModeVariantsFromEnv('auto');
    expect(variants).toEqual([
      { id: 'linked-project', projectMode: 'linked-project' },
      { id: 'no-linked-project', projectMode: 'no-linked-project' },
    ]);
  });
  it('falls back to default when env contains only invalid modes', () => {
    process.env.CLI_EVAL_PROJECT_MODES = 'foo,bar';
    const variants = getProjectModeVariantsFromEnv('linked-project');
    expect(variants).toEqual([
      { id: 'default', projectMode: 'linked-project' },
    ]);
  });
});
