import { describe, expect, it } from 'vitest';
import path from 'path';
import { getImportClosureOptions, withTimeout } from '../src/import-closure';

describe('getImportClosureOptions', () => {
  it('includes runtime, framework, and worker startup modules', () => {
    const workPath = path.join('/work');

    const options = getImportClosureOptions({
      workPath,
      entrypoint: 'config/wsgi.py',
      frameworkSeeds: ['config.settings', 'myapp.apps.MyAppConfig'],
      subscriberDeclarations: [{ moduleName: 'workers.subscriber' }],
      subscribers: [{ name: 'workers-subscriber' }],
      workflows: [{ name: 'flows_workflows', moduleName: 'flows.workflows' }],
      workflowMode: 'queue',
      sitePackageDirs: [path.join('/venv/site-packages')],
    });

    expect(options.seeds).toEqual([
      'vercel_runtime.vc_init',
      path.join(workPath, 'config/wsgi.py'),
      'config.settings',
      'myapp.apps.MyAppConfig',
      'workers.subscriber',
      'flows.workflows',
      '_vc_queue_handlers._py_subscribers_workers_subscriber',
      '_vc_queue_handlers._py_workflows_flows__workflows',
    ]);
  });

  it('searches the nested Django application root before the project root', () => {
    const workPath = path.join('/work');
    const djangoPath = path.join(workPath, 'mysite');
    const sitePackages = path.join('/venv/site-packages');

    const options = getImportClosureOptions({
      workPath,
      frameworkSeeds: [],
      extraPythonPath: djangoPath,
      subscriberDeclarations: [],
      subscribers: [],
      workflows: [],
      workflowMode: 'workers',
      sitePackageDirs: [sitePackages],
    });

    expect(options.searchRoots).toEqual([djangoPath, workPath, sitePackages]);
  });

  it('deduplicates seeds and search roots', () => {
    const workPath = path.join('/work');

    const options = getImportClosureOptions({
      workPath,
      frameworkSeeds: ['vercel_runtime.vc_init'],
      extraPythonPath: workPath,
      subscriberDeclarations: [{ moduleName: 'worker' }],
      subscribers: [],
      workflows: [{ name: 'worker', moduleName: 'worker' }],
      workflowMode: 'workers',
      sitePackageDirs: [workPath],
    });

    expect(options.seeds).toEqual(['vercel_runtime.vc_init', 'worker']);
    expect(options.searchRoots).toEqual([workPath]);
  });
});

describe('withTimeout', () => {
  it('resolves the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'test')).resolves.toBe(
      42
    );
  });

  it('resolves undefined when the promise exceeds the timeout', async () => {
    const never = new Promise<number>(() => {});
    await expect(withTimeout(never, 10, 'test')).resolves.toBeUndefined();
  });

  it('rejects when the promise rejects in time', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('boom')), 1000, 'test')
    ).rejects.toThrow('boom');
  });
});
