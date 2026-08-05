import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureLaravelZeroConfigStorage } from '../../../src/util/laravel/ensure-zero-config-storage';

const connectResourceToProject = vi.hoisted(() => vi.fn());

vi.mock(
  '../../../src/util/integration-resource/connect-resource-to-project',
  () => ({ connectResourceToProject })
);
vi.mock('../../../src/output-manager', () => ({
  default: {
    debug: vi.fn(),
    spinner: vi.fn(),
    stopSpinner: vi.fn(),
    success: vi.fn(),
  },
}));

const directories: string[] = [];

function fixture(laravel = true): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'laravel-storage-test-'));
  directories.push(directory);
  if (laravel) {
    writeFileSync(path.join(directory, 'artisan'), '#!/usr/bin/env php');
    writeFileSync(
      path.join(directory, 'composer.json'),
      JSON.stringify({ require: { 'laravel/framework': '^13.0' } })
    );
  }
  return directory;
}

afterEach(() => {
  vi.clearAllMocks();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Laravel zero-config storage', () => {
  it('does nothing for another framework', async () => {
    const fetch = vi.fn();

    await ensureLaravelZeroConfigStorage(
      { fetch } as any,
      fixture(false),
      { id: 'project_1', name: 'demo' },
      { id: 'team_1' }
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it('reuses a connected Blob store', async () => {
    const fetch = vi.fn().mockResolvedValue({
      stores: [
        {
          id: 'store_1',
          name: 'existing',
          type: 'blob',
          projectsMetadata: [{ projectId: 'project_1' }],
        },
      ],
    });

    await ensureLaravelZeroConfigStorage(
      { fetch } as any,
      fixture(),
      { id: 'project_1', name: 'demo' },
      { id: 'team_1' }
    );

    expect(fetch).toHaveBeenCalledOnce();
    expect(connectResourceToProject).not.toHaveBeenCalled();
  });

  it('creates and connects private storage for a stock Laravel app', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ stores: [] })
      .mockResolvedValueOnce({ store: { id: 'store_new' } });

    await ensureLaravelZeroConfigStorage(
      { fetch } as any,
      fixture(),
      { id: 'project_1', name: 'demo' },
      { id: 'team_1' }
    );

    expect(fetch).toHaveBeenNthCalledWith(2, '/v1/storage/stores/blob', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'demo-laravel-files',
        region: 'iad1',
        access: 'private',
      }),
      accountId: 'team_1',
    });
    expect(connectResourceToProject).toHaveBeenCalledWith(
      expect.anything(),
      'project_1',
      'store_new',
      ['production', 'preview', 'development'],
      { accountId: 'team_1' }
    );
  });
});
