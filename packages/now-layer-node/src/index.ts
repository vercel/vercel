import { tmpdir } from 'os';
import { join } from 'path';
import { glob, Files } from '@now/build-utils';
import { mkdir, remove, pathExists } from 'fs-extra';
import { install } from './install';

interface BuildLayerConfig {
  runtimeVersion: string;
  platform: string;
  arch: string;
}

interface BuildLayerResult {
  files: Files;
  entrypoint: string;
}

export async function buildLayer({
  runtimeVersion,
  platform,
  arch,
}: BuildLayerConfig): Promise<BuildLayerResult> {
  const dir = join(
    tmpdir(),
    `now-layer-node-${runtimeVersion}-${platform}-${arch}`
  );
  const exists = await pathExists(dir);
  if (exists) {
    await remove(dir);
  }
  await mkdir(dir);
  const { entrypoint } = await install(dir, runtimeVersion, platform, arch);
  const files = await glob('{bin/node,bin/node.exe,include/**}', {
    cwd: dir,
  });
  return { files, entrypoint };
}
