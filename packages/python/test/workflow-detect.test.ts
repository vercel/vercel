import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import {
  detectWorkflowNamespace,
  detectWorkflowNamespaceFromSource,
  getWorkflowTopicPattern,
} from '../src/workflows';

const uvPath = process.env.UV_BIN || 'uv';

describe('workflow namespace detection', () => {
  let workDir: string;

  afterEach(async () => {
    if (workDir) {
      await fs.remove(workDir);
    }
  });

  async function setupWorkDir(flowSource: string): Promise<string> {
    workDir = path.join(
      tmpdir(),
      `workflow-detect-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdirp(path.join(workDir, 'vercel'));
    await fs.writeFile(path.join(workDir, 'vercel', '__init__.py'), '');
    await fs.writeFile(
      path.join(workDir, 'vercel', 'workflow.py'),
      [
        'class Workflows:',
        '    def __init__(self, *, namespace=None):',
        '        self.namespace = namespace',
        '',
      ].join('\n')
    );
    await fs.writeFile(path.join(workDir, 'flows.py'), flowSource);
    return workDir;
  }

  function detect(variableName = 'workflows') {
    return detectWorkflowNamespace({
      uvPath,
      uvRunArgs: ['--no-project'],
      env: process.env,
      workPath: workDir,
      moduleName: 'flows',
      variableName,
    });
  }

  function detectFromSource(variableName = 'workflows') {
    return detectWorkflowNamespaceFromSource({
      uvPath,
      uvRunArgs: ['--no-project'],
      env: process.env,
      workPath: workDir,
      entrypoint: 'flows.py',
      variableName,
    });
  }

  it('extracts a namespace from a Workflows entrypoint', async () => {
    await setupWorkDir(
      [
        'from vercel.workflow import Workflows',
        'workflows = Workflows(namespace="billing")',
        '',
      ].join('\n')
    );

    await expect(detect()).resolves.toBe('billing');
    expect(getWorkflowTopicPattern('billing')).toBe('__billing_wkf_*');
  });

  it('extracts a literal namespace from source for local development', async () => {
    await setupWorkDir(
      [
        'from vercel.workflow import Workflows',
        'WORKFLOW_NAMESPACE = "billing"',
        'workflows = Workflows(namespace=WORKFLOW_NAMESPACE)',
        '',
      ].join('\n')
    );

    await expect(detectFromSource()).resolves.toBe('billing');
  });

  it('preserves the default unnamespaced topic', async () => {
    await setupWorkDir(
      [
        'from vercel.workflow import Workflows',
        'workflows = Workflows()',
        '',
      ].join('\n')
    );

    await expect(detect()).resolves.toBeNull();
    await expect(detectFromSource()).resolves.toBeNull();
    expect(getWorkflowTopicPattern(null)).toBe('__wkf_*');
  });

  it('treats workflow registries from older SDKs as unnamespaced', async () => {
    await setupWorkDir(
      [
        'from vercel.workflow import Workflows',
        'workflows = Workflows()',
        'del workflows.namespace',
        '',
      ].join('\n')
    );

    await expect(detect()).resolves.toBeNull();
  });

  it('rejects an entrypoint that is not a Workflows instance', async () => {
    await setupWorkDir('workflows = object()\n');

    await expect(detect()).rejects.toThrow(
      /is not a vercel\.workflow\.Workflows instance/
    );
  });

  it('reports missing entrypoint attributes', async () => {
    await setupWorkDir('value = object()\n');

    await expect(detect('missing')).rejects.toThrow(
      /has no attribute 'missing'/
    );
  });

  it('rejects an invalid namespace returned by the entrypoint', async () => {
    await setupWorkDir(
      [
        'from vercel.workflow import Workflows',
        'workflows = Workflows(namespace="Billing")',
        '',
      ].join('\n')
    );

    await expect(detect()).rejects.toThrow(
      /returned invalid namespace "Billing"/
    );
  });

  it('rejects dynamic namespaces during local source detection', async () => {
    await setupWorkDir(
      [
        'import os',
        'from vercel.workflow import Workflows',
        'workflows = Workflows(namespace=os.getenv("WORKFLOW_NAMESPACE"))',
        '',
      ].join('\n')
    );

    await expect(detectFromSource()).rejects.toThrow(
      /must be a string literal or top-level string constant/
    );
  });
});
