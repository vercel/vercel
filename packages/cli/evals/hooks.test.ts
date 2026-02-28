import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  destroy,
  getEvalVariants,
  getProjectModeVariantsFromEnv,
  getSkillsVariantsFromEnv,
  setup,
} from './hooks';
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
  it('setup (variant: projectMode=auto with .vercel/project.json) resolves to linked-project', async () => {
    const sandbox = createSandboxDir(true);
    const context: EvalRunContext = {
      cwd: sandbox,
      sandboxProjectDir: sandbox,
      projectMode: 'auto',
      withSkills: true,
    };

    const result = await setup(context);

    expect(result).toEqual({
      resolvedProjectMode: 'linked-project',
      hasLinkedProject: true,
    });

    await destroy(context, result);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it('setup (variant: projectMode=auto, no .vercel) resolves to no-linked-project', async () => {
    const sandbox = createSandboxDir(false);
    const context: EvalRunContext = {
      cwd: sandbox,
      sandboxProjectDir: sandbox,
      projectMode: 'auto',
      withSkills: true,
    };

    const result = await setup(context);

    expect(result).toEqual({
      resolvedProjectMode: 'no-linked-project',
      hasLinkedProject: false,
    });

    await destroy(context, result);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it('setup (variant: projectMode=linked-project, no .vercel) throws with clear message', async () => {
    const sandbox = createSandboxDir(false);
    const context: EvalRunContext = {
      cwd: sandbox,
      sandboxProjectDir: sandbox,
      projectMode: 'linked-project',
      withSkills: true,
    };

    await expect(setup(context)).rejects.toThrow(/expected a linked project/i);

    rmSync(sandbox, { recursive: true, force: true });
  });
});

describe('CLI evals project-mode matrix', () => {
  it('getProjectModeVariantsFromEnv (experiment: no CLI_EVAL_PROJECT_MODES) returns single default variant', () => {
    delete process.env.CLI_EVAL_PROJECT_MODES;
    const variants = getProjectModeVariantsFromEnv('auto');
    expect(variants).toEqual([{ id: 'default', projectMode: 'auto' }]);
  });

  it('getProjectModeVariantsFromEnv (experiment: linked-project,no-linked-project) returns both variants', () => {
    process.env.CLI_EVAL_PROJECT_MODES = 'linked-project,no-linked-project';
    const variants = getProjectModeVariantsFromEnv('auto');
    expect(variants).toEqual([
      { id: 'linked-project', projectMode: 'linked-project' },
      { id: 'no-linked-project', projectMode: 'no-linked-project' },
    ]);
  });
  it('getProjectModeVariantsFromEnv (experiment: invalid modes only) falls back to default', () => {
    process.env.CLI_EVAL_PROJECT_MODES = 'foo,bar';
    const variants = getProjectModeVariantsFromEnv('linked-project');
    expect(variants).toEqual([
      { id: 'default', projectMode: 'linked-project' },
    ]);
  });
});

describe('CLI evals skills matrix', () => {
  it('getSkillsVariantsFromEnv (default) returns with-skills and without-skills', () => {
    delete process.env.CLI_EVAL_SKILLS_MODES;
    const variants = getSkillsVariantsFromEnv();
    expect(variants).toEqual([
      { id: 'with-skills', withSkills: true },
      { id: 'without-skills', withSkills: false },
    ]);
  });

  it('getSkillsVariantsFromEnv (CLI_EVAL_SKILLS_MODES=with-skills) returns single variant', () => {
    process.env.CLI_EVAL_SKILLS_MODES = 'with-skills';
    const variants = getSkillsVariantsFromEnv();
    expect(variants).toEqual([{ id: 'with-skills', withSkills: true }]);
  });

  it('getEvalVariants (default) returns cross product: default-with-skills, default-without-skills', () => {
    delete process.env.CLI_EVAL_PROJECT_MODES;
    delete process.env.CLI_EVAL_SKILLS_MODES;
    const variants = getEvalVariants('auto');
    expect(variants).toEqual([
      { id: 'default-with-skills', projectMode: 'auto', withSkills: true },
      { id: 'default-without-skills', projectMode: 'auto', withSkills: false },
    ]);
  });
});

describe('CLI evals project cleanup', () => {
  it('destroy (variant: SetupResult with createdProjectId) calls DELETE /v9/projects/:id', async () => {
    const originalFetch = (globalThis as any).fetch;
    const calls: Array<{ url: any; init: any }> = [];

    (globalThis as any).fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () => '',
      } as any;
    });

    process.env.VERCEL_TOKEN = 'test-token';
    process.env.CLI_EVAL_TEAM_ID = 'team_xyz';

    const sandbox = createSandboxDir(true);
    const context: EvalRunContext = {
      cwd: sandbox,
      sandboxProjectDir: sandbox,
      projectMode: 'linked-project',
      withSkills: true,
    };

    await destroy(context, {
      resolvedProjectMode: 'linked-project',
      hasLinkedProject: true,
      createdProjectId: 'proj_123',
    });

    expect(calls.length).toBe(1);
    expect(String(calls[0].url)).toContain('/v9/projects/proj_123');
    expect(calls[0].init.method).toBe('DELETE');

    rmSync(sandbox, { recursive: true, force: true });
    (globalThis as any).fetch = originalFetch;
    delete process.env.VERCEL_TOKEN;
    delete process.env.CLI_EVAL_TEAM_ID;
  });
});
