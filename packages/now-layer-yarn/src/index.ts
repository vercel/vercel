import { tmpdir } from 'os';
import { join } from 'path';
import { glob } from '@now/build-utils';
import { mkdir, remove, pathExists } from 'fs-extra';
import { install } from './install';

interface LayerConfig {
  runtimeVersion: string;
  platform: string;
  arch: string;
}

export async function buildLayer({
  runtimeVersion,
  platform,
  arch,
}: LayerConfig) {
  const dir = join(
    tmpdir(),
    `now-layer-yarn-${runtimeVersion}-${platform}-${arch}`
  );
  const exists = await pathExists(dir);
  if (exists) {
    await remove(dir);
  }
  await mkdir(dir);
  await install(dir, runtimeVersion);
  const files = await glob('{bin/**,lib/**}', {
    cwd: dir,
  });
  return { files };
}
