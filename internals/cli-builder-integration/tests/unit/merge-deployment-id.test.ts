import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import fs from 'fs-extra';
import { mergeDeploymentId } from '../../src/do-build';

const readJSONFile = async <T>(file: string): Promise<T | null> => {
  try {
    return (await fs.readJSON(file)) as T;
  } catch {
    return null;
  }
};
const isCantParseJSONFile = (_value: unknown): _value is Error => false;

describe('mergeDeploymentId', () => {
  let workPath: string;

  const writeRoutesManifest = (dir: string, deploymentId: string) =>
    fs.outputJSON(join(workPath, dir, 'routes-manifest.json'), {
      version: 3,
      deploymentId,
    });

  const merge = (outputDirectory?: string | null, existing?: string) =>
    mergeDeploymentId(
      existing,
      [],
      workPath,
      outputDirectory,
      readJSONFile,
      isCantParseJSONFile
    );

  beforeEach(async () => {
    workPath = await fs.mkdtemp(join(tmpdir(), 'merge-deployment-id-'));
  });

  afterEach(async () => {
    await fs.remove(workPath);
  });

  it('reads the deploymentId from <root>/.next by default', async () => {
    await writeRoutesManifest('.next', 'root-id');
    await expect(merge(undefined)).resolves.toBe('root-id');
  });

  it('reads the deploymentId from a non-root Output Directory', async () => {
    await writeRoutesManifest('dist/apps/web/.next', 'nx-id');
    await expect(merge('dist/apps/web/.next')).resolves.toBe('nx-id');
  });

  it('prefers the Output Directory over <root>/.next', async () => {
    await writeRoutesManifest('.next', 'stale-id');
    await writeRoutesManifest('build', 'dist-dir-id');
    await expect(merge('build')).resolves.toBe('dist-dir-id');
  });

  it('falls back to <root>/.next when the Output Directory has no manifest', async () => {
    await writeRoutesManifest('.next', 'root-id');
    await expect(merge('dist')).resolves.toBe('root-id');
  });

  it('keeps an existing config.json deploymentId', async () => {
    await writeRoutesManifest('dist/apps/web/.next', 'nx-id');
    await expect(merge('dist/apps/web/.next', 'from-config')).resolves.toBe(
      'from-config'
    );
  });

  it('returns undefined when no manifest exists', async () => {
    await expect(merge('dist/apps/web/.next')).resolves.toBeUndefined();
  });
});
