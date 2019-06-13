import { tmpdir } from 'os';
import { join } from 'path';
import { glob, BuildLayerConfig, BuildLayerResult } from '@now/build-utils';
import { mkdir, remove, pathExists } from 'fs-extra';
import { install } from './install';

export async function buildLayer({
  runtimeVersion,
  platform,
  arch,
}: BuildLayerConfig): Promise<BuildLayerResult> {
  const dir = join(
    tmpdir(),
    `now-layer-yarn-${runtimeVersion}-${platform}-${arch}`
  );
  const exists = await pathExists(dir);
  if (exists) {
    await remove(dir);
  }
  await mkdir(dir);
  const { entrypoint } = await install(dir, runtimeVersion);
  const files = await glob('{bin/**,lib/**}', {
    cwd: dir,
  });
  return { files, entrypoint };
}
