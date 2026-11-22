import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import { getSeedPackagesMissingFromLock } from '../src/utils';

const tempDirs: string[] = [];

function writeUvLock(packageNames: string[]): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'seed-packages-'));
  tempDirs.push(dir);
  const packages = packageNames
    .map(name => `[[package]]\nname = "${name}"\nversion = "1.0.0"\n`)
    .join('\n');
  const lockPath = path.join(dir, 'uv.lock');
  fs.writeFileSync(
    lockPath,
    `version = 1\nrequires-python = ">=3.12"\n\n${packages}`
  );
  return lockPath;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.removeSync(dir);
  }
});

describe('getSeedPackagesMissingFromLock', () => {
  it('returns pip when the project does not lock it', async () => {
    const lockPath = writeUvLock(['fastapi', 'setuptools']);

    expect(await getSeedPackagesMissingFromLock(lockPath)).toEqual(['pip']);
  });

  it('keeps pip when the project locks it', async () => {
    const lockPath = writeUvLock(['fastapi', 'pip']);

    expect(await getSeedPackagesMissingFromLock(lockPath)).toEqual([]);
  });

  it('keeps seed packages when the lock cannot be read', async () => {
    const lockPath = path.join(tmpdir(), 'missing-seed-packages', 'uv.lock');

    expect(await getSeedPackagesMissingFromLock(lockPath)).toEqual([]);
  });
});
