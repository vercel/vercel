import fs from 'fs/promises';
import { join, dirname } from 'path';
import execa from 'execa';
import { getExampleList } from '../examples/example-list';
import { mapOldToNew } from '../examples/map-old-to-new';

const repoRoot = join(__dirname, '..', '..', '..');
const pubDir = join(repoRoot, 'public');

async function main() {
  console.log(`Building static frontend ${repoRoot}...`);

  await fs.rm(pubDir, { recursive: true, force: true });
  await fs.mkdir(pubDir);

  await fs.cp(
    join(repoRoot, 'packages', 'frameworks', 'logos'),
    join(pubDir, 'framework-logos'),
    { recursive: true, force: true }
  );

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

  const { stdout: sha } = await execa('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: repoRoot,
  });

  const tarballsDir = join(pubDir, 'tarballs');
  const packagesDir = join(repoRoot, 'packages');
  const packages = await fs.readdir(packagesDir);
  for (const pkg of packages) {
    const fullDir = join(packagesDir, pkg);
    const packageJsonRaw = await fs.readFile(
      join(fullDir, 'package.json'),
      'utf-8'
    );
    const packageJson = JSON.parse(packageJsonRaw);
    const tarballName = `${packageJson.name
      .replace('@', '')
      .replace('/', '-')}-v${packageJson.version}-${sha.trim()}.tgz`;
    const destTarballPath = join(tarballsDir, `${packageJson.name}.tgz`);
    await fs.mkdir(dirname(destTarballPath), { recursive: true });
    await fs.copyFile(join(fullDir, tarballName), destTarballPath);
  }

  console.log('Completed building static frontend.');
}

main().catch(err => {
  console.log('error running build:', err);
  process.exit(1);
});
