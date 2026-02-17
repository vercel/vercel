import execa from 'execa';
import path from 'path';
import fs from 'fs-extra';
import { TurboDryRun } from './types';

const rootDir = path.join(__dirname, '..');
const ignoredPackages = ['api', 'evals', 'examples'];

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

  // Build the Python runtime wheel so it can be hosted on preview deployments
  await buildPythonWheel();
}

async function buildPythonWheel() {
  const pythonRuntimeDir = path.join(rootDir, 'python', 'vercel-runtime');
  const pyprojectPath = path.join(pythonRuntimeDir, 'pyproject.toml');
  const tag = '@vercel/python-runtime@*';
  const pkgPath = 'python/vercel-runtime';

  try {
    // Find the last release tag for this package
    let lastTag: string;
    try {
      const { stdout } = await execa('git', [
        'describe',
        '--tags',
        '--match',
        tag,
        '--abbrev=0',
      ]);
      lastTag = stdout.trim();
    } catch {
      console.log(
        'No previous @vercel/python-runtime tag found, building wheel.'
      );
      lastTag = '';
    }

    // Check if there are changes since the last tag
    // (git diff --quiet exits 0 if no changes, 1 if changes)
    if (lastTag) {
      const result = await execa('git', [
        'diff',
        '--quiet',
        lastTag,
        'HEAD',
        '--',
        pkgPath,
      ]).catch(err => err);

      if (result.exitCode === 0) {
        console.log(
          `No changes to ${pkgPath} since ${lastTag}, skipping wheel build.`
        );
        return;
      }
    }

    const sha = (await getSha()).trim();
    let timestamp: number;
    try {
      const { stdout } = await execa('git', ['log', '-1', '--format=%ct'], {
        env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
      });
      timestamp = Number(stdout.trim()) || 0;
    } catch {
      timestamp = 0;
    }
    const original = await fs.readFile(pyprojectPath, 'utf8');
    // e.g. 0.4.0 -> 0.5.0.dev1739371200+d496c36
    const devVersion = original.replace(
      /^(version\s*=\s*")(\d+)\.(\d+)\.(\d+)(")/m,
      (
        _m: string,
        pre: string,
        major: string,
        minor: string,
        _patch: string,
        post: string
      ) => `${pre}${major}.${Number(minor) + 1}.0.dev${timestamp}+${sha}${post}`
    );
    await fs.writeFile(pyprojectPath, devVersion);

    console.log(
      `Building Python runtime wheel (dev${timestamp}+${sha}, ${lastTag || 'no prior tag'})...`
    );

    try {
      await execa('uv', ['build', '--wheel', '--out-dir', 'dist/'], {
        cwd: pythonRuntimeDir,
        stdio: 'inherit',
      });
      console.log('Python runtime wheel built successfully.');
    } finally {
      await fs.writeFile(pyprojectPath, original);
    }
  } catch (err) {
    console.error('Failed to build Python runtime wheel:', err);
    throw err;
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
