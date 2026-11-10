// Mirror a preview CLI tarball and every preview-deployment tarball it
// depends on, with their URLs rewritten to a fixed loopback origin. CI serves
// <out> over HTTP so the CLI upgrade tests' SIGKILL-bounded installs never
// fetch from the preview deployment. CI runs this on Linux.
//
// Usage:
//   node utils/mirror-preview-tarballs.js --tarball <vercel.tgz> --out <dir> --origin http://127.0.0.1:4873
const { execFile } = require('node:child_process');
const {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} = require('node:fs/promises');
const { dirname, join } = require('node:path');
const { promisify } = require('node:util');

const exec = promisify(execFile);

// Package managers never install a dependency's devDependencies, and some
// preview devDependencies (private internals) are not deployed at all. Only
// these fields are followed. URLs in devDependencies are only rewritten.
const INSTALL_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'builders',
];
const REWRITE_FIELDS = [...INSTALL_FIELDS, 'devDependencies'];
const DEPLOYMENT_ORIGIN_PATTERN =
  /^https:\/\/[^/]+\.vercel\.sh(?=\/tarballs\/)/;
const CLI_TARBALL = 'vercel.tgz';

function installValues(manifest) {
  return INSTALL_FIELDS.flatMap(field =>
    Object.values(manifest[field] ?? {}).filter(
      value => typeof value === 'string'
    )
  );
}

function findDeploymentOrigin(manifest, pattern = DEPLOYMENT_ORIGIN_PATTERN) {
  const origins = new Set(
    installValues(manifest).flatMap(value => pattern.exec(value) ?? [])
  );
  if (origins.size !== 1) {
    throw new Error(
      `Expected exactly one preview deployment origin in the CLI manifest, found ${origins.size}${origins.size ? `: ${[...origins].join(', ')}` : ''}`
    );
  }
  return [...origins][0];
}

// Returns the tarball path relative to /tarballs/, or undefined when the
// value is not a tarball on this deployment.
function deploymentTarballPath(value, deploymentOrigin) {
  const prefix = `${deploymentOrigin}/tarballs/`;
  if (!value.startsWith(prefix)) return undefined;
  const path = value.slice(prefix.length);
  const segments = path.split('/');
  if (
    !path.endsWith('.tgz') ||
    /[\\?#]/.test(path) ||
    segments.some(segment => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Refusing to mirror unexpected tarball URL: ${value}`);
  }
  return path;
}

// Rewrites this deployment's tarball pins to the mirror. Returns installable
// deployment tarballs to fetch and tarball URLs on any other origin.
function mirrorManifest(manifest, deploymentOrigin, origin) {
  const mirrored = { ...manifest };
  const downloads = new Map();
  const offenders = [];
  for (const field of REWRITE_FIELDS) {
    const specs = manifest[field];
    if (!specs || typeof specs !== 'object') continue;
    mirrored[field] = Object.fromEntries(
      Object.entries(specs).map(([name, value]) => {
        if (typeof value !== 'string') return [name, value];
        const path = deploymentTarballPath(value, deploymentOrigin);
        if (path) {
          if (INSTALL_FIELDS.includes(field)) downloads.set(path, value);
          return [name, `${origin}/tarballs/${path}`];
        }
        if (/^[a-z][a-z\d+.-]*:\/\/[^/]+\/tarballs\//i.test(value)) {
          offenders.push(value);
        }
        return [name, value];
      })
    );
  }
  return { manifest: mirrored, downloads, offenders };
}

async function download(url, destination) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function mirrorPreviewTarballs({
  tarball,
  out,
  origin,
  deploymentOriginPattern = DEPLOYMENT_ORIGIN_PATTERN,
  log = console.log,
}) {
  origin = origin.replace(/\/+$/, '');
  const tarballsDir = join(out, 'tarballs');
  const scratch = join(out, '.scratch');
  await rm(tarballsDir, { recursive: true, force: true });
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  try {
    // [path relative to /tarballs/, local source tarball]. The loop appends
    // each newly discovered deployment tarball.
    const queue = [[CLI_TARBALL, tarball]];
    const seen = new Set([CLI_TARBALL]);
    let deploymentOrigin;
    for (const [path, source] of queue) {
      const directory = await mkdtemp(join(scratch, 'package-'));
      await exec('tar', ['-xzpf', source, '-C', directory]);
      const manifestFile = join(directory, 'package/package.json');
      const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
      deploymentOrigin ??= findDeploymentOrigin(
        manifest,
        deploymentOriginPattern
      );
      const mirrored = mirrorManifest(manifest, deploymentOrigin, origin);
      if (mirrored.offenders.length) {
        throw new Error(
          `${path} still references tarballs outside ${origin}/tarballs/: ${mirrored.offenders.join(', ')}`
        );
      }

      for (const [child, url] of mirrored.downloads) {
        if (seen.has(child)) continue;
        seen.add(child);
        const destination = join(scratch, 'downloads', child);
        await download(url, destination);
        queue.push([child, destination]);
      }

      await writeFile(
        manifestFile,
        `${JSON.stringify(mirrored.manifest, null, 2)}\n`
      );
      const destination = join(tarballsDir, path);
      await mkdir(dirname(destination), { recursive: true });
      await exec('tar', ['-czf', destination, '-C', directory, 'package']);
      await rm(directory, { recursive: true, force: true });
    }

    log(`fetched ${queue.length - 1} tarballs from ${deploymentOrigin}`);
    return {
      deploymentOrigin,
      fetched: queue.length - 1,
      tarball: join(tarballsDir, CLI_TARBALL),
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (!flag.startsWith('--') || value === undefined) {
      throw new Error(`Unexpected argument: ${flag}`);
    }
    options[flag.slice(2)] = value;
  }
  return options;
}

async function main(argv) {
  const { tarball, out, origin } = parseArgs(argv);
  if (!tarball || !out || !origin) {
    throw new Error(
      'Usage: node utils/mirror-preview-tarballs.js --tarball <vercel.tgz> --out <dir> --origin <http://127.0.0.1:port>'
    );
  }
  const result = await mirrorPreviewTarballs({ tarball, out, origin });
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `tarball=${result.tarball}\n`);
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  deploymentTarballPath,
  findDeploymentOrigin,
  mirrorPreviewTarballs,
};
