import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import blob from '../../../../src/commands/blob';
import * as blobModule from '@vercel/blob';
import { expectDeprecationInJson } from '../../../helpers/deprecation-warning';

vi.mock('@vercel/blob');

const mockedBlob = vi.mocked(blobModule);

// `--store` picks the Blob store for OIDC credentials. `--store-id` is its
// old name.
describe('blob --store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function run(...args: string[]) {
    client.reset();
    vi.clearAllMocks();
    mockedBlob.list.mockResolvedValue({
      blobs: [],
      cursor: undefined,
      hasMore: false,
    });
    client.setArgv('blob', 'list', '--oidc-token', 'oidc_token', ...args);
    const exitCode = await blob(client);
    return {
      exitCode,
      options: mockedBlob.list.mock.calls[0]?.[0],
      stdout: client.stdout.getFullOutput(),
      stderr: client.stderr.getFullOutput(),
    };
  }

  it('lists the store given with --store', async () => {
    const result = await run('--store', 'store_abc');

    expect(result.exitCode).toBe(0);
    expect(result.options).toMatchObject({
      oidcToken: 'oidc_token',
      storeId: 'store_abc',
    });
    expect(result.stderr).not.toContain('deprecated');
  });

  it.each([
    [['--store-id', 'store_abc']],
    [['--store-id=store_abc']],
  ])('still accepts %j, with one warning that names --store', async oldArgs => {
    const now = await run('--store', 'store_abc');
    const before = await run(...oldArgs);

    expect(before.exitCode).toBe(now.exitCode);
    expect(before.options).toEqual(now.options);
    expect(before.stdout).toBe(now.stdout);
    expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
    expect(before.stderr).toContain(
      '! --store-id is deprecated. Use --store.\n'
    );
  });

  it('puts the warning in the JSON result with --json', async () => {
    const now = await run('--store', 'store_abc', '--json');
    const before = await run('--store-id', 'store_abc', '--json');

    expect(before.exitCode).toBe(0);
    expect(before.options).toEqual(now.options);
    expectDeprecationInJson(
      before.stdout,
      now.stdout,
      '--store-id is deprecated. Use --store.'
    );
    expect(before.stderr).not.toContain('deprecated');
  });

  it('rejects --store with --store-id before any request', async () => {
    const result = await run('--store', 'store_abc', '--store-id', 'store_abc');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Can't use --store with --store-id.");
    expect(result.options).toBeUndefined();
  });

  it('still needs --oidc-token with --store', async () => {
    client.reset();
    client.setArgv('blob', 'list', '--store', 'store_abc');

    expect(await blob(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '--oidc-token and --store must be passed together'
    );
  });
});
