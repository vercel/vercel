import fs from 'fs/promises';
import { join, dirname } from 'path';
import { getExampleList } from '../examples/example-list';
import { mapOldToNew } from '../examples/map-old-to-new';

const repoRoot = join(__dirname, '..', '..', '..');
const pubDir = join(repoRoot, 'public');

async function main() {
  console.log(`Building static frontend ${repoRoot}...`);

  await fs.rm(pubDir, { recursive: true, force: true });
  await fs.mkdir(pubDir);

  const examples = await getExampleList();
  const pathListAll = join(pubDir, 'list-all.json');
  await fs.writeFile(pathListAll, JSON.stringify(examples));

  const exampleDirs = await fs.readdir(join(repoRoot, 'examples'), {
    withFileTypes: true,
  });

  const existingExamples = exampleDirs
    .filter(dir => dir.isDirectory())
    .map(dir => ({
      name: dir.name,
      visible: true,
      suggestions: [],
    }));

  const oldExamples = Object.keys(mapOldToNew).map(key => ({
    name: key,
    visible: false,
    suggestions: mapOldToNew[key],
  }));

  const pathList = join(pubDir, 'list.json');
  await fs.writeFile(
    pathList,
    JSON.stringify([...existingExamples, ...oldExamples])
  );

  const tarballsDir = join(pubDir, 'tarballs');

  const packagesDir = join(repoRoot, 'packages');
  const packages = await fs.readdir(packagesDir);
  for (const pkg of packages) {
    const fullDir = join(packagesDir, pkg);
    const packageJson = await fs.readJson(join(fullDir, 'package.json'));
    const tarballName = `${packageJson.name
      .replace('@', '')
      .replace('/', '-')}-v${packageJson.version}.tgz`;
    const destTarballPath = join(tarballsDir, `${packageJson.name}.tgz`);
    await fs.mkdirp(dirname(destTarballPath));
    await fs.copy(join(fullDir, tarballName), destTarballPath);
  }

  console.log('Completed building static frontend.');
}

main().catch(console.error);
