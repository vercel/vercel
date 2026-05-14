import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputRoot = join(packageRoot, 'dist-native');
const dryRun = process.argv.includes('--dry-run');
const allowMissing = process.argv.includes('--allow-missing');
const tag = getArgValue('--tag') ?? process.env.VERCEL_VC_NATIVE_NPM_TAG;

await execFileAsync(process.execPath, [
  join(packageRoot, 'scripts', 'stage-packages.mjs'),
  ...(dryRun || allowMissing ? ['--allow-missing'] : []),
]);

const entries = await readdir(outputRoot, { withFileTypes: true });
const packageDirs = entries
  .filter(entry => entry.isDirectory())
  .map(entry => join(outputRoot, entry.name))
  .sort((left, right) => {
    if (left.endsWith('/vc-native')) return 1;
    if (right.endsWith('/vc-native')) return -1;
    return left.localeCompare(right);
  });

for (const packageDir of packageDirs) {
  const manifest = JSON.parse(
    await readFile(join(packageDir, 'package.json'), 'utf8')
  );
  const spec = `${manifest.name}@${manifest.version}`;

  if (await isPublished(spec)) {
    console.log(`skip: ${spec} already published`);
    continue;
  }

  const args = ['publish', packageDir, '--access', 'public', '--provenance'];
  if (tag) {
    args.push('--tag', tag);
  }
  if (dryRun) {
    args.push('--dry-run');
  }

  console.log(`${dryRun ? 'dry-run' : 'publishing'}: ${spec}`);
  await run('npm', args);
}

async function isPublished(spec) {
  try {
    await execFileAsync('npm', ['view', spec, 'version']);
    return true;
  } catch {
    return false;
  }
}

async function run(command, args) {
  const child = execFileAsync(command, args, {
    maxBuffer: 1024 * 1024 * 10,
  });
  const { stdout, stderr } = await child;
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index !== -1) {
    return process.argv[index + 1];
  }

  const prefix = `${name}=`;
  const arg = process.argv.find(value => value.startsWith(prefix));
  return arg?.slice(prefix.length);
}
