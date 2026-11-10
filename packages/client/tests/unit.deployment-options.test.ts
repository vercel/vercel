import { beforeEach, describe, expect, it, vi } from 'vitest';
import buildCreateDeployment from '../src/create-deployment';
import type { DeploymentOptions } from '../src/types';

const { collect, upload, deploy } = vi.hoisted(() => ({
  collect: vi.fn(),
  upload: vi.fn(),
  deploy: vi.fn(),
}));

vi.mock('../src/collect-deployment-files', async importOriginal => ({
  ...(await importOriginal<typeof import('../src/collect-deployment-files')>()),
  collectDeploymentFiles: collect,
}));
vi.mock('../src/upload', () => ({ upload }));
vi.mock('../src/deploy', () => ({ deploy }));

function deferredOptions() {
  let resolve!: (options: DeploymentOptions) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<DeploymentOptions>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('deployment options resolved during file preparation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    collect.mockResolvedValue({
      fileList: ['/project/index.html'],
      filesMap: new Map(),
    });
    upload.mockImplementation(async function* () {
      yield { type: 'created', payload: {} };
    });
    deploy.mockImplementation(async function* () {
      yield { type: 'created', payload: {} };
    });
  });

  it('hashes files while metadata is pending, then uploads with resolved options', async () => {
    const pending = deferredOptions();
    const iterator = buildCreateDeployment()(
      { path: '/project', token: 'synthetic' },
      pending.promise
    );
    expect((await iterator.next()).value.type).toBe('hashes-calculated');
    const next = iterator.next();
    await Promise.resolve();
    expect(upload).not.toHaveBeenCalled();

    pending.resolve({ name: 'project', gitMetadata: { commitSha: 'abc' } });
    expect((await next).value.type).toBe('created');
    expect(upload.mock.calls[0][2]).toEqual({
      name: 'project',
      gitMetadata: { commitSha: 'abc' },
      version: 2,
    });
    await iterator.return(undefined);
  });

  it('never uploads when metadata resolution fails', async () => {
    const pending = deferredOptions();
    const iterator = buildCreateDeployment()(
      { path: '/project', token: 'synthetic' },
      pending.promise
    );
    await iterator.next();
    pending.reject(new Error('metadata failed'));
    await expect(iterator.next()).rejects.toThrow('metadata failed');
    expect(upload).not.toHaveBeenCalled();
  });

  it('handles metadata rejection after file collection has already failed', async () => {
    collect.mockRejectedValueOnce(new Error('files failed'));
    const pending = deferredOptions();
    const iterator = buildCreateDeployment()(
      { path: '/project', token: 'synthetic' },
      pending.promise
    );
    await expect(iterator.next()).rejects.toThrow('files failed');
    pending.reject(new Error('metadata failed'));
    await new Promise(resolve => setImmediate(resolve));
    expect(upload).not.toHaveBeenCalled();
  });

  it('resolves options in manual mode without collecting files', async () => {
    const pending = deferredOptions();
    const iterator = buildCreateDeployment()(
      { path: '/project', token: 'synthetic', manual: true, prebuilt: true },
      pending.promise
    );
    const next = iterator.next();
    await Promise.resolve();
    expect(deploy).not.toHaveBeenCalled();
    pending.resolve({ name: 'project' });
    expect((await next).value.type).toBe('created');
    expect(deploy.mock.calls[0][2]).toEqual({
      name: 'project',
      build: { env: { VERCEL_MANUAL_PROVISIONING: '1' } },
      version: 2,
    });
    expect(collect).not.toHaveBeenCalled();
    await iterator.return(undefined);
  });

  it('validates manual mode before waiting for options', async () => {
    const iterator = buildCreateDeployment()(
      { path: '/project', token: 'synthetic', manual: true },
      deferredOptions().promise
    );
    await expect(iterator.next()).rejects.toMatchObject({
      code: 'invalid_options',
    });
  });
});
