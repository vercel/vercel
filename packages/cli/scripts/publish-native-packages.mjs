import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const cliRoot = dirname(
  fileURLToPath(new URL('../package.json', import.meta.url))
);
const nativeRoot = join(cliRoot, 'dist-native-packages');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function capture(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
}

const tarballDir = mkdtempSync(join(tmpdir(), 'vercel-native-packages-'));

try {
  const packageDirs = readdirSync(nativeRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(packageDirName =>
      existsSync(join(nativeRoot, packageDirName, 'package.json'))
    )
    .sort((a, b) => {
      if (a === 'cli-native') return 1;
      if (b === 'cli-native') return -1;
      return a.localeCompare(b);
    });

  if (packageDirs.length === 0) {
    console.error(`no native packages found in ${nativeRoot}`);
    process.exit(1);
  }

  for (const packageDirName of packageDirs) {
    const packageDir = join(nativeRoot, packageDirName);
    const pkg = JSON.parse(
      readFileSync(join(packageDir, 'package.json'), 'utf8')
    );

    const view = capture(
      'npm',
      ['view', `${pkg.name}@${pkg.version}`, 'version'],
      {
        cwd: packageDir,
      }
    );
    if (view.status === 0) {
      console.log(`skip: ${pkg.name}@${pkg.version} (already published)`);
      continue;
    }

    console.log(`packing: ${pkg.name}@${pkg.version}`);
    const pack = capture('npm', ['pack', '--pack-destination', tarballDir], {
      cwd: packageDir,
    });
    if (pack.status !== 0) {
      process.stderr.write(pack.stderr);
      process.exit(pack.status ?? 1);
    }
    const tarball = join(tarballDir, pack.stdout.trim().split('\n').at(-1));

    console.log(`publishing: ${pkg.name}@${pkg.version}`);
    run('npm', ['publish', tarball, '--access', 'public', '--provenance'], {
      cwd: packageDir,
    });
  }
} finally {
  rmSync(tarballDir, { recursive: true, force: true });
}
