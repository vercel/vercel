import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { applyWorkflowDispatch } from '../src/workflow-dispatch';

async function setupWorkPath(packageJson?: object): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'be-wf-dispatch-'));
  if (packageJson) {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify(packageJson),
      'utf-8'
    );
  }
  return dir;
}

function getShimSource(
  result: Awaited<ReturnType<typeof applyWorkflowDispatch>>
): string {
  const blob = result.files[result.handler];
  return (blob as unknown as { data: string }).data;
}

describe('applyWorkflowDispatch', () => {
  it('produces an ESM shim for an .mjs handler', async () => {
    const workPath = await setupWorkPath();
    try {
      const result = await applyWorkflowDispatch({
        files: {},
        handler: 'index.mjs',
        workPath,
        workflowBundlePath: '__vc_workflow_bundle.cjs',
      });
      expect(result.handler).toBe('index.__vc_workflow_dispatch.mjs');
      const src = getShimSource(result);
      expect(src).toContain('workflow/runtime');
      expect(src).toContain('workflowEntrypoint');
      expect(src).toContain('createWorld');
      expect(src).toContain('setWorld');
      expect(src).toContain('__vc_workflow_bundle.cjs');
      expect(src).toContain('export default');
    } finally {
      await rm(workPath, { recursive: true, force: true });
    }
  });

  it('produces a CJS shim for a .cjs handler', async () => {
    const workPath = await setupWorkPath();
    try {
      const result = await applyWorkflowDispatch({
        files: {},
        handler: 'index.cjs',
        workPath,
        workflowBundlePath: '__vc_workflow_bundle.cjs',
      });
      expect(result.handler).toBe('index.__vc_workflow_dispatch.cjs');
      const src = getShimSource(result);
      expect(src).toContain('workflow/runtime');
      expect(src).toContain('workflowEntrypoint');
      expect(src).toContain('module.exports');
      expect(src).toContain('__vc_workflow_bundle.cjs');
    } finally {
      await rm(workPath, { recursive: true, force: true });
    }
  });

  it('treats .js as ESM when package.json "type" is "module"', async () => {
    const workPath = await setupWorkPath({ type: 'module' });
    try {
      const result = await applyWorkflowDispatch({
        files: {},
        handler: 'index.js',
        workPath,
        workflowBundlePath: '__vc_workflow_bundle.cjs',
      });
      expect(result.handler).toBe('index.__vc_workflow_dispatch.js');
      const src = getShimSource(result);
      expect(src).toContain('export default');
      expect(src).toContain('import');
    } finally {
      await rm(workPath, { recursive: true, force: true });
    }
  });

  it('treats .js as CJS by default (no package.json)', async () => {
    const workPath = await setupWorkPath();
    try {
      const result = await applyWorkflowDispatch({
        files: {},
        handler: 'index.js',
        workPath,
        workflowBundlePath: '__vc_workflow_bundle.cjs',
      });
      expect(result.handler).toBe('index.__vc_workflow_dispatch.js');
      const src = getShimSource(result);
      expect(src).toContain('module.exports');
    } finally {
      await rm(workPath, { recursive: true, force: true });
    }
  });

  it('computes correct relative path when handler is in a subdirectory', async () => {
    const workPath = await setupWorkPath();
    try {
      const result = await applyWorkflowDispatch({
        files: {},
        handler: 'dist/index.mjs',
        workPath,
        workflowBundlePath: '__vc_workflow_bundle.cjs',
      });
      expect(result.handler).toBe('dist/index.__vc_workflow_dispatch.mjs');
      const src = getShimSource(result);
      // The bundle path should be relative from dist/ back to root.
      expect(src).toContain('../__vc_workflow_bundle.cjs');
    } finally {
      await rm(workPath, { recursive: true, force: true });
    }
  });

  it('preserves existing files in the returned files map', async () => {
    const workPath = await setupWorkPath();
    try {
      const result = await applyWorkflowDispatch({
        files: { 'existing.js': {} as any },
        handler: 'index.mjs',
        workPath,
        workflowBundlePath: '__vc_workflow_bundle.cjs',
      });
      expect(result.files['existing.js']).toBeDefined();
      expect(result.files[result.handler]).toBeDefined();
    } finally {
      await rm(workPath, { recursive: true, force: true });
    }
  });
});
