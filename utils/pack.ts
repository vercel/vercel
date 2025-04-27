import execa from 'execa';
import path from 'path';
import fs from 'fs-extra';
import { TurboDryRun } from './types';

const rootDir = path.join(__dirname, '..');
const ignoredPackages = ['api', 'examples'];

async function main() {
  const sha = await getSha();

  const { stdout: turboStdout } = await execa(
    'turbo',
    ['run', 'build', '--dry=json'],
    {
      cwd: rootDir,
    }
  );
  const turboJson: TurboDryRun = JSON.parse(turboStdout);
  for (const task of turboJson.tasks) {
    if (ignoredPackages.includes(task.directory)) {
      continue;
    }

    const dir = path.join(rootDir, task.directory);
    const packageJsonPath = path.join(dir, 'package.json');
    const originalPackageObj = await fs.readJson(packageJsonPath);
    const packageObj = await fs.readJson(packageJsonPath);
    packageObj.version += `-${sha.trim()}`;

    if (task.dependencies.length > 0) {
      for (const dependency of task.dependencies) {
        const name = dependency.split('#')[0];
        // pnpm 8 fails to install dependencies with @ in the URL
        const escapedName = name.replace('@', '%40');
        const tarballUrl = `https://${process.env.VERCEL_URL}/tarballs/${escapedName}.tgz`;
        if (packageObj.dependencies && name in packageObj.dependencies) {
          packageObj.dependencies[name] = tarballUrl;
        }
        if (packageObj.devDependencies && name in packageObj.devDependencies) {
          packageObj.devDependencies[name] = tarballUrl;
        }
      }
    }
    await fs.writeJson(packageJsonPath, packageObj, { spaces: 2 });

    await execa('pnpm', ['pack'], {
      cwd: dir,
      stdio: 'inherit',
    });
    await fs.writeJson(packageJsonPath, originalPackageObj, { spaces: 2 });
  }
}

async function getSha(): Promise<string> {
  try {
    const { stdout } = await execa('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: rootDir,
    });
    return stdout;
  } catch (error) {
    console.error(error);

    console.log('Assuming this is not a git repo. Using "local" as the SHA.');
    return 'local';
  }
}

main().catch(err => {
  console.log('error running pack:', err);
  process.exit(1);
});
