import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { availableParallelism, platform, arch, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeVersion = process.env.VERCEL_CLI_NODE_VERSION ?? '22.22.2';
const nodeTag = `v${nodeVersion}`;
const nodePlatform =
  process.env.VERCEL_CLI_NODE_PLATFORM ?? nodePlatformForHost(platform());
const nodeArch = process.env.VERCEL_CLI_NODE_ARCH ?? nodeArchForHost(arch());
const runtimeName = `node-${nodeTag}-${nodePlatform}-${nodeArch}-small-icu`;
const outputNode = join(
  packageRoot,
  '.node-runtime',
  runtimeName,
  nodeBinPath()
);
const buildJobs =
  process.env.VERCEL_CLI_NODE_BUILD_JOBS ?? String(availableParallelism());

if (
  platform() !== hostPlatformForNodePlatform(nodePlatform) ||
  nodeArchForHost(arch()) !== nodeArch
) {
  throw new Error(
    `Custom CLI Node runtime build must run on the target architecture; requested ${nodePlatform}-${nodeArch}, got ${platform()}-${arch()}`
  );
}

if (await isExpectedNode(outputNode, nodePlatform, nodeArch)) {
  console.log(`Custom CLI Node runtime already exists: ${outputNode}`);
  process.exit(0);
}

const buildRoot = await fs.mkdtemp(join(tmpdir(), 'vercel-cli-node-'));
const sourceArchive = join(buildRoot, `node-${nodeTag}.tar.gz`);
const sourceDir = join(buildRoot, `node-${nodeTag}`);

try {
  await downloadAndVerifySource(sourceArchive);
  await run('tar', ['-xzf', sourceArchive], buildRoot);

  const builtNode = await buildNode(sourceDir);
  await fs.mkdir(dirname(outputNode), { recursive: true });
  await fs.copyFile(builtNode, outputNode);
  await fs.chmod(outputNode, 0o755);
  const stripped = await stripAndSignNode();

  if (!(await isExpectedNode(outputNode, nodePlatform, nodeArch))) {
    throw new Error(
      `Built runtime does not report ${nodeTag} ${nodePlatform}-${nodeArch}: ${outputNode}`
    );
  }

  await fs.writeFile(
    join(dirname(outputNode), 'metadata.json'),
    JSON.stringify(
      {
        nodeVersion: nodeTag,
        platform: nodePlatform,
        arch: nodeArch,
        intl: 'small-icu',
        locales: ['en'],
        stripped,
        configure: configureFlags(),
      },
      null,
      2
    ) + '\n'
  );

  console.log(`Built custom CLI Node runtime: ${outputNode}`);
} finally {
  await fs.rm(buildRoot, { recursive: true, force: true });
}

async function buildNode(sourceDir) {
  if (nodePlatform === 'win') {
    const configFlags = configureFlags()
      .filter(flag => !flag.startsWith('--dest-cpu='))
      .join(' ');

    await run(
      'vcbuild.bat',
      [
        'release',
        nodeArch,
        'small-icu',
        'nonpm',
        'nocorepack',
        'openssl-no-asm',
      ],
      sourceDir,
      {
        shell: true,
        env: {
          ...process.env,
          config_flags: configFlags,
        },
      }
    );

    return join(sourceDir, 'Release', 'node.exe');
  }

  await run('./configure', configureFlags(), sourceDir);
  await run('make', [`-j${buildJobs}`], sourceDir);

  return join(sourceDir, 'out', 'Release', 'node');
}

async function stripAndSignNode() {
  if (nodePlatform === 'win') {
    return false;
  }

  const shouldStrip = !(nodePlatform === 'darwin' && nodeArch === 'x64');

  if (shouldStrip) {
    await run('strip', [outputNode], packageRoot);
  }

  if (nodePlatform === 'darwin') {
    await run('codesign', ['-f', '--sign', '-', outputNode], packageRoot);
  }

  return shouldStrip;
}

function configureFlags() {
  return [
    `--dest-cpu=${nodeArch}`,
    `--dest-os=${configureOsForNodePlatform(nodePlatform)}`,
    '--with-intl=small-icu',
    '--with-icu-locales=en',
    '--without-inspector',
    '--without-npm',
    '--without-corepack',
    '--without-sqlite',
  ];
}

async function downloadAndVerifySource(destination) {
  const sourceUrl = `https://nodejs.org/dist/${nodeTag}/node-${nodeTag}.tar.gz`;
  const checksumUrl = `https://nodejs.org/dist/${nodeTag}/SHASUMS256.txt`;

  console.log(`Downloading ${sourceUrl}`);
  await download(sourceUrl, destination);

  const checksums = await fetchText(checksumUrl);
  const checksumLine = checksums
    .split('\n')
    .find(line => line.includes(` node-${nodeTag}.tar.gz`));
  const expectedHash = checksumLine?.split(/\s+/)[0];

  if (!expectedHash) {
    throw new Error(`Could not find checksum for node-${nodeTag}.tar.gz`);
  }

  const actualHash = createHash('sha256')
    .update(await fs.readFile(destination))
    .digest('hex');

  if (actualHash !== expectedHash) {
    throw new Error(
      `Checksum mismatch for node-${nodeTag}.tar.gz: expected ${expectedHash}, got ${actualHash}`
    );
  }
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  await pipeline(response.body, createWriteStream(destination));
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  return response.text();
}

async function run(command, args, cwd, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd,
    env: options.env ?? process.env,
    shell: options.shell ?? false,
    stdio: 'inherit',
  });

  const exitCode = await new Promise((resolveExit, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited with signal ${signal}`));
        return;
      }
      resolveExit(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    throw new Error(`${command} exited with code ${exitCode}`);
  }
}

function nodePlatformForHost(hostPlatform) {
  if (hostPlatform === 'darwin' || hostPlatform === 'linux') {
    return hostPlatform;
  }

  if (hostPlatform === 'win32') {
    return 'win';
  }

  throw new Error(`Unsupported host platform: ${hostPlatform}`);
}

function hostPlatformForNodePlatform(targetPlatform) {
  if (targetPlatform === 'darwin' || targetPlatform === 'linux') {
    return targetPlatform;
  }

  if (targetPlatform === 'win') {
    return 'win32';
  }

  throw new Error(`Unsupported target platform: ${targetPlatform}`);
}

function nodeArchForHost(hostArch) {
  if (hostArch === 'arm64' || hostArch === 'x64') {
    return hostArch;
  }

  throw new Error(`Unsupported host architecture: ${hostArch}`);
}

function configureOsForNodePlatform(targetPlatform) {
  if (targetPlatform === 'darwin') {
    return 'mac';
  }

  if (targetPlatform === 'linux' || targetPlatform === 'win') {
    return targetPlatform;
  }

  throw new Error(`Unsupported Node configure platform: ${targetPlatform}`);
}

function nodeBinPath() {
  return nodePlatform === 'win' ? 'node.exe' : join('bin', 'node');
}

async function isExpectedNode(nodePath, expectedPlatform, expectedArch) {
  try {
    const { stdout } = await execFileAsync(nodePath, [
      '-p',
      'JSON.stringify({version: process.version, platform: process.platform, arch: process.arch})',
    ]);
    const metadata = JSON.parse(stdout);
    return (
      metadata.version === nodeTag &&
      metadata.platform === hostPlatformForNodePlatform(expectedPlatform) &&
      metadata.arch === expectedArch
    );
  } catch {
    return false;
  }
}
