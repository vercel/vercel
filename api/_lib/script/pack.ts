import execa from 'execa';
import path from 'path';
import fs from 'fs-extra';
import { TurboDryRun } from './types';

const rootDir = path.join(__dirname, '../../../');

async function main() {
  const { stdout: sha } = await execa('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: rootDir,
  });
  const { stdout: turboStdout } = await execa(
    'turbo',
    ['run', 'build', '--dry=json'],
    {
      cwd: rootDir,
    }
  );
  const turboJson: TurboDryRun = JSON.parse(turboStdout);
  for (const task of turboJson.tasks) {
    const dir = path.join(rootDir, task.directory);
    const packageJsonPath = path.join(dir, 'package.json');
    const originalPackageObj = await fs.readJson(packageJsonPath);
    let packageObj = JSON.parse(JSON.stringify(originalPackageObj));
    packageObj.version += `-${sha.trim()}`;

    if (task.dependencies.length > 0) {
      packageObj = modifyPackageJson(task, packageObj);
    }
    await fs.writeJson(packageJsonPath, packageObj, { spaces: 2 });

    await execa('yarn', ['pack'], {
      cwd: dir,
      stdio: 'inherit',
    });
    await fs.writeJson(packageJsonPath, originalPackageObj, { spaces: 2 });
  }
}

export function modifyPackageJson(task, packageObj) {
  for (const dependency of task.dependencies) {
    const name = dependency.split('#')[0];
    const tarballUrl = `https://${process.env.VERCEL_URL}/tarballs/${name}.tgz`;
    if (packageObj.dependencies && name in packageObj.dependencies) {
      packageObj.dependencies[name] = tarballUrl;
    }
    if (packageObj.devDependencies && name in packageObj.devDependencies) {
      packageObj.devDependencies[name] = tarballUrl;
    }
  }
  return packageObj;
}

main().catch(err => {
  console.log('error running pack:', err);
  process.exit(1);
});
