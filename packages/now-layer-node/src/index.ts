import { tmpdir } from 'os';
import { join } from 'path';
import { glob, BuildLayerConfig, BuildLayerResult } from '@now/build-utils';
import { mkdir, remove, pathExists, copy, writeFile } from 'fs-extra';
import { install } from './install';
import { bash, javascript } from '../bootstrap/contents';

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

  const bootstrapDir = join(__dirname, '..', 'bootstrap');
  const contents = platform === 'win32' ? javascript : bash;
  await writeFile(join(dir, 'bootstrap'), contents);
  await copy(join(bootstrapDir, 'now_init.js'), join(dir, 'now_init.js'));

  const files = await glob(
    '{bin/node,bin/node.exe,include/**,bootstrap,now_init.js}',
    {
      cwd: dir,
    }
  );
  return { files, entrypoint };
}
