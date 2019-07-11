import test from 'ava';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirp, remove, writeFile } from 'fs-extra';

import createOutput from '../src/util/output';
import { getBuilder } from '../src/util/dev/builder-cache';
import { getYarnPath } from '../src/util/dev/yarn-installer';

test('[DevBuilder] Lazily installs builders', async t => {
  const debug = false;
  const output = createOutput({ debug });
  const builderDir = join(
    tmpdir(),
    `now-cli-${Math.random()
      .toString(32)
      .slice(-5)}`
  );
  await mkdirp(builderDir);
  await writeFile(join(builderDir, 'package.json'), '{}');
  try {
    const dir = join(builderDir, 'node_modules', '@now', 'bash');

    // Make sure the module is not already installed
    let err;
    try {
      require(dir);
    } catch (e) {
      err = e;
    }
    t.is(err.code, 'MODULE_NOT_FOUND');

    // Invoke `getBuilder()` which installs the builder
    // when not already installed
    const yarnDir = await getYarnPath(output);
    const builderWithPkg = await getBuilder(
      '@now/bash',
      yarnDir,
      output,
      builderDir
    );
    t.is(builderWithPkg.package.name, '@now/bash');

    // Ensure that the builder was installed to the correct location
    const builder = require(dir);
    t.is(typeof builder.build, 'function');
  } finally {
    await remove(builderDir);
  }
});
