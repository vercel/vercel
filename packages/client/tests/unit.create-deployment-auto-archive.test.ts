import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDeployment, FILE_LIMIT } from '../src/index';
import { generateFakeFiles } from './util/generate-fake-files';
import { generateNewToken } from './common';

// We mock the upload module to prevent actual API calls.
// We only need to verify that the archive mode is set correctly
// before the upload phase begins.
vi.mock('../src/upload', () => ({
  upload: async function* () {
    // no-op: don't actually upload
  },
}));

describe('createDeployment auto-archive', () => {
  let token: string;

  beforeEach(async () => {
    token = await generateNewToken();
  });

  it('should auto-upgrade to archive mode when file count exceeds FILE_LIMIT', async () => {
    // Each file is 1 byte, so we need FILE_LIMIT + 1 files.
    // generateFakeFiles takes totalMB and fileSizeInBytes, so:
    //   totalFiles = ceil((totalMB * 1024) / fileSizeInBytes)
    // We want FILE_LIMIT + 1 = 15001 files at 1 byte each:
    //   totalMB = ceil(15001 / 1024) ~= 15
    const fileCount = FILE_LIMIT + 1;
    const fileSizeInBytes = 1;
    const totalKB = Math.ceil(fileCount / 1024);
    const uploadFolder = await generateFakeFiles(totalKB, fileSizeInBytes);

    const events: Array<{ type: string; payload: any }> = [];

    for await (const event of createDeployment(
      {
        token,
        teamId: 'test-team',
        path: uploadFolder,
      },
      { name: 'auto-archive-test' }
    )) {
      events.push(event);
    }

    // Should have emitted a warning about auto-archive
    const warningEvent = events.find(
      e =>
        e.type === 'warning' &&
        typeof e.payload === 'string' &&
        e.payload.includes('Automatically using archive mode')
    );
    expect(warningEvent).toBeDefined();
    expect(warningEvent!.payload).toContain(String(FILE_LIMIT));

    // Should have produced hashes-calculated with tgz chunks
    // (archive mode produces entries named `.vercel/source.tgz.partN`)
    const hashEvent = events.find(e => e.type === 'hashes-calculated');
    expect(hashEvent).toBeDefined();
    const fileNames = Object.values(hashEvent!.payload).flatMap(
      (item: any) => item.names || []
    );
    expect(fileNames.some((n: string) => n.includes('source.tgz.part'))).toBe(
      true
    );
  });

  it('should NOT auto-upgrade when file count is within FILE_LIMIT', async () => {
    // Create a small directory with just a few files
    const uploadFolder = await generateFakeFiles(1, 100);

    const events: Array<{ type: string; payload: any }> = [];

    for await (const event of createDeployment(
      {
        token,
        teamId: 'test-team',
        path: uploadFolder,
      },
      { name: 'no-auto-archive-test' }
    )) {
      events.push(event);
    }

    // Should NOT have emitted an auto-archive warning
    const warningEvent = events.find(
      e =>
        e.type === 'warning' &&
        typeof e.payload === 'string' &&
        e.payload.includes('Automatically using archive mode')
    );
    expect(warningEvent).toBeUndefined();

    // hashes-calculated entries should be individual file hashes, not tgz chunks
    const hashEvent = events.find(e => e.type === 'hashes-calculated');
    expect(hashEvent).toBeDefined();
    const fileNames = Object.values(hashEvent!.payload).flatMap(
      (item: any) => item.names || []
    );
    expect(
      fileNames.every((n: string) => !n.includes('source.tgz.part'))
    ).toBe(true);
  });

  it('should NOT override when archive is already explicitly set', async () => {
    // Even with many files, if archive is already set, don't emit warning
    const fileCount = FILE_LIMIT + 1;
    const fileSizeInBytes = 1;
    const totalKB = Math.ceil(fileCount / 1024);
    const uploadFolder = await generateFakeFiles(totalKB, fileSizeInBytes);

    const events: Array<{ type: string; payload: any }> = [];

    for await (const event of createDeployment(
      {
        token,
        teamId: 'test-team',
        path: uploadFolder,
        archive: 'tgz', // explicitly set
      },
      { name: 'explicit-archive-test' }
    )) {
      events.push(event);
    }

    // Should NOT have emitted the auto-archive warning (user already opted in)
    const warningEvent = events.find(
      e =>
        e.type === 'warning' &&
        typeof e.payload === 'string' &&
        e.payload.includes('Automatically using archive mode')
    );
    expect(warningEvent).toBeUndefined();

    // Should still use archive mode (tgz chunks)
    const hashEvent = events.find(e => e.type === 'hashes-calculated');
    expect(hashEvent).toBeDefined();
    const fileNames = Object.values(hashEvent!.payload).flatMap(
      (item: any) => item.names || []
    );
    expect(fileNames.some((n: string) => n.includes('source.tgz.part'))).toBe(
      true
    );
  });
});
