import { createHash } from 'crypto';
import { extract } from 'tar';
import execa from 'execa';
import {
  createReadStream,
  mkdirp,
  pathExists,
  readFile,
  remove,
  symlink,
} from 'fs-extra';
import { delimiter, dirname, join } from 'path';
import stringArgv from 'string-argv';
import {
  cloneEnv,
  debug,
  extractZip,
  VerifiedDownloader,
} from '@vercel/build-utils';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { tmpdir } from 'os';
import XDGAppPaths from 'xdg-app-paths';
import type { Env } from '@vercel/build-utils';

const streamPipeline = promisify(pipeline);

/**
 * Registry of Go toolchain versions we will download plus the expected
 * SHA-256 digest of each platform/arch archive. Adding a new Go version
 * requires committing its official SHA-256 values (published at
 * https://go.dev/dl/?mode=json) to this map. This deliberately makes any
 * attempt to install an un-pinned version an explicit PR rather than a
 * silent download.
 */
interface GoReleaseEntry {
  version: string;
  /**
   * Map of `${os}-${arch}` (matching {@link getGoUrl}) → lowercase hex SHA-256
   * of the release archive.
   */
  sha256: Record<string, string>;
}

const versionMap = new Map<string, GoReleaseEntry>([
  [
    '1.26',
    {
      version: '1.26.1',
      sha256: {
        'linux-amd64':
          '031f088e5d955bab8657ede27ad4e3bc5b7c1ba281f05f245bcc304f327c987a',
        'linux-arm64':
          'a290581cfe4fe28ddd737dde3095f3dbeb7f2e4065cab4eae44dfc53b760c2f7',
        'darwin-amd64':
          '65773dab2f8cc4cd23d93ba6d0a805de150ca0b78378879292be0b903b8cdd08',
        'darwin-arm64':
          '353df43a7811ce284c8938b5f3c7df40b7bfb6f56cb165b150bc40b5e2dd541f',
        'windows-amd64':
          '9b68112c913f45b7aebbf13c036721264bbba7e03a642f8f7490c561eebd1ecc',
      },
    },
  ],
  [
    '1.25',
    {
      version: '1.25.8',
      sha256: {
        'linux-amd64':
          'ceb5e041bbc3893846bd1614d76cb4681c91dadee579426cf21a63f2d7e03be6',
        'linux-arm64':
          '7d137f59f66bb93f40a6b2b11e713adc2a9d0c8d9ae581718e3fad19e5295dc7',
        'darwin-amd64':
          'a0b8136598baf192af400051cee2481ffb407f4c113a81ff400896e26cbce9e4',
        'darwin-arm64':
          'c6547959f5dbe8440bf3da972bd65ba900168de5e7ab01464fbdc7ac8375c21c',
        'windows-amd64':
          '8d4ed9a270b33df7a6d3ff3a5316e103e0042fcc4f0c9a80e40378700bab6794',
      },
    },
  ],
  [
    '1.24',
    {
      version: '1.24.13',
      sha256: {
        'linux-amd64':
          '1fc94b57134d51669c72173ad5d49fd62afb0f1db9bf3f798fd98ee423f8d730',
        'linux-arm64':
          '74d97be1cc3a474129590c67ebf748a96e72d9f3a2b6fef3ed3275de591d49b3',
        'darwin-amd64':
          '6cc6549b06725220b342b740497ffd24e0ebdcef75781a77931ca199f46ad781',
        'darwin-arm64':
          'f282d882c3353485e2fc6c634606d85caf36e855167d59b996dbeae19fa7629a',
        'windows-amd64':
          '40b16bc8f00540a2cb02dff4de72b73e966fdd8d65f95e33d8e4080b48a2459a',
      },
    },
  ],
  [
    '1.23',
    {
      version: '1.23.12',
      sha256: {
        'linux-amd64':
          'd3847fef834e9db11bf64e3fb34db9c04db14e068eeb064f49af747010454f90',
        'linux-arm64':
          '52ce172f96e21da53b1ae9079808560d49b02ac86cecfa457217597f9bc28ab3',
        'darwin-amd64':
          '0f6efdc3ffc6f03b230016acca0aef43c229de022d0ff401e7aa4ad4862eca8e',
        'darwin-arm64':
          '5bfa117e401ae64e7ffb960243c448b535fe007e682a13ff6c7371f4a6f0ccaa',
        'windows-amd64':
          '07c35866cdd864b81bb6f1cfbf25ac7f87ddc3a976ede1bf5112acbb12dfe6dc',
      },
    },
  ],
  [
    '1.22',
    {
      version: '1.22.12',
      sha256: {
        'linux-amd64':
          '4fa4f869b0f7fc6bb1eb2660e74657fbf04cdd290b5aef905585c86051b34d43',
        'linux-arm64':
          'fd017e647ec28525e86ae8203236e0653242722a7436929b1f775744e26278e7',
        'darwin-amd64':
          'e7bbe07e96f0bd3df04225090fe1e7852ed33af37c43a23e16edbbb3b90a5b7c',
        'darwin-arm64':
          '416c35218edb9d20990b5d8fc87be655d8b39926f15524ea35c66ee70273050d',
        'windows-amd64':
          '2ceda04074eac51f4b0b85a9fcca38bcd49daee24bed9ea1f29958a8e22673a6',
      },
    },
  ],
  [
    '1.21',
    {
      version: '1.21.13',
      sha256: {
        'linux-amd64':
          '502fc16d5910562461e6a6631fb6377de2322aad7304bf2bcd23500ba9dab4a7',
        'linux-arm64':
          '2ca2d70dc9c84feef959eb31f2a5aac33eefd8c97fe48f1548886d737bffabd4',
        'darwin-amd64':
          '796fd05e8741f6776c505eb201922864f2e32991679b639d9fcb524dbe300c0d',
        'darwin-arm64':
          'c04ee7bdc0e65cf17133994c40ee9bdfa1b1dc9587b3baedaea39affdb8e5b49',
        'windows-amd64':
          '924655193634bfcdf7ec7a34589e0d73458741998a59e4155a929ce85f81af2d',
      },
    },
  ],
  [
    '1.20',
    {
      version: '1.20.14',
      sha256: {
        'linux-amd64':
          'ff445e48af27f93f66bd949ae060d97991c83e11289009d311f25426258f9c44',
        'linux-arm64':
          '2096507509a98782850d1f0669786c09727053e9fe3c92b03c0d96f48700282b',
        'darwin-amd64':
          '754363489e2244e72cb49b4ec6ddfd6a2c60b0700f8c4876e11befb1913b11c5',
        'darwin-arm64':
          '6da3f76164b215053daf730a9b8f1d673dbbaa4c61031374a6744b75cb728641',
        'windows-amd64':
          '0e0d0190406ead891d94ecf00f961bb5cfa15ddd47499d2649f12eee80aee110',
      },
    },
  ],
  [
    '1.19',
    {
      version: '1.19.13',
      sha256: {
        'linux-amd64':
          '4643d4c29c55f53fa0349367d7f1bb5ca554ea6ef528c146825b0f8464e2e668',
        'linux-arm64':
          '1142ada7bba786d299812b23edd446761a54efbbcde346c2f0bc69ca6a007b58',
        'darwin-amd64':
          '1b4329dc9e73def7f894ca71fce78bb9f3f5c4c8671b6c7e4f363a3f47e88325',
        'darwin-arm64':
          '022b35fa9c79b9457fa4a14fd9c4cf5f8ea315a8f2e3b3cd949fea55e11a7d7b',
        'windows-amd64':
          '908cba438f6f34fdf5ec8572f5f8759cb85b87f5c0b4fc4a389249bf92b86736',
      },
    },
  ],
  [
    '1.18',
    {
      version: '1.18.10',
      sha256: {
        'linux-amd64':
          '5e05400e4c79ef5394424c0eff5b9141cb782da25f64f79d54c98af0a37f8d49',
        'linux-arm64':
          '160497c583d4c7cbc1661230e68b758d01f741cf4bece67e48edc4fdd40ed92d',
        'darwin-amd64':
          '5614904f2b0b546b1493f294122fea7d67b2fbfc2efe84b1ab560fb678502e1f',
        'darwin-arm64':
          '718b32cb2c1d203ba2c5e6d2fc3cf96a6952b38e389d94ff6cdb099eb959dade',
        'windows-amd64':
          'caf3fcc9d39371fc45ad46afad7f6d12b42433c7d7ac593ada6351cd39ee217d',
      },
    },
  ],
  [
    '1.17',
    {
      version: '1.17.13',
      sha256: {
        'linux-amd64':
          '4cdd2bc664724dc7db94ad51b503512c5ae7220951cac568120f64f8e94399fc',
        'linux-arm64':
          '914daad3f011cc2014dea799bb7490442677e4ad6de0b2ac3ded6cee7e3f493d',
        'darwin-amd64':
          'c101beaa232e0f448fab692dc036cd6b4677091ff89c4889cc8754b1b29c6608',
        'darwin-arm64':
          'e4ccc9c082d91eaa0b866078b591fc97d24b91495f12deb3dd2d8eda4e55a6ea',
        'windows-amd64':
          '6cea8e199c8034995f3a691ef4564e0cc6645ee1649d7ef268a836387f1a5dfa',
      },
    },
  ],
  [
    '1.16',
    {
      version: '1.16.15',
      sha256: {
        'linux-amd64':
          '77c782a633186d78c384f972fb113a43c24be0234c42fef22c2d8c4c4c8e7475',
        'linux-arm64':
          'c2f27f0ce5620a9bc2ff3446165d1974ef94e9b885ec12dbfa3c07e0e198b7ce',
        'darwin-amd64':
          '4f16a427ea513892b7be6646ca26159223d404193ef28c5c45c5f2ec9a0f03d1',
        'darwin-arm64':
          '28365c5c252970c10f2627dc0aa63a2ec3df04a92df4d45ed83dbe464732c3e0',
        'windows-amd64':
          '0d6e551206b6d744d1286e62abf46aa2f17fed90f07ec4624a0448d71380407d',
      },
    },
  ],
  [
    '1.15',
    {
      version: '1.15.15',
      sha256: {
        'linux-amd64':
          '0885cf046a9f099e260d98d9ec5d19ea9328f34c8dc4956e1d3cd87daaddb345',
        'darwin-amd64':
          '2f4c119524450ee94062a1ce7112fb88ce0fe4bb0303a302e002183a550c25c2',
        'windows-amd64':
          '7df7bf948dcc8ec0a3902e3301d17cbb5c2ebb01297d686ee2302e41f4ac6e10',
      },
    },
  ],
  [
    '1.14',
    {
      version: '1.14.15',
      sha256: {
        'linux-amd64':
          'c64a57b374a81f7cf1408d2c410a28c6f142414f1ffa9d1062de1d653b0ae0d6',
        'darwin-amd64':
          'cc116e7522d1d1bcb606ce413555c4f2d5c86c0c8d5e5074a0d57b303d8edb50',
        'windows-amd64':
          '189bc564d537d86f80c70757ee4c29fb1c2c6e8d05bb6de1242a03a96ac850cb',
      },
    },
  ],
  [
    '1.13',
    {
      version: '1.13.15',
      sha256: {
        'linux-amd64':
          '01cc3ddf6273900eba3e2bf311238828b7168b822bb57a9ccab4d7aa2acd6028',
        'darwin-amd64':
          '63180e32e9b7bfcd0c1c056e7c215299f662a1098a30316599c7b3e2e2fa28e7',
        'windows-amd64':
          '26c031d5dc2b39578943dbd34fe5c464ac4ed1c82f8de59f12999d3bf9f83ea1',
      },
    },
  ],
]);
const archMap = new Map([
  ['x64', 'amd64'],
  ['x86', '386'],
]);
const platformMap = new Map([['win32', 'windows']]);
export const localCacheDir = join('.vercel', 'cache', 'golang');

const GO_FLAGS = process.platform === 'win32' ? [] : ['-ldflags', '-s -w'];
const GO_MIN_MAJOR_VERSION = 1;
const GO_MIN_MINOR_VERSION = 13;

/**
 * Determines the URL to download the Golang SDK.
 * @param version The desireed Go version
 * @returns The Go download URL
 */
function getGoUrl(version: string) {
  const { arch, platform } = process;
  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  const goPlatform = platformMap.get(platform) || platform;
  let goArch = archMap.get(arch) || arch;

  // Go 1.16 was the first version to support arm64, so if the version is younger
  // we need to download the amd64 version
  if (
    platform === 'darwin' &&
    goArch === 'arm64' &&
    parseInt((/^\d+.(\d+)/.exec(version) as string[])[1], 10) < 16
  ) {
    goArch = 'amd64';
  }

  const filename = `go${version}.${goPlatform}-${goArch}.${ext}`;
  return {
    filename,
    url: `https://dl.google.com/go/${filename}`,
    platformKey: `${goPlatform}-${goArch}`,
  };
}

/**
 * Looks up the expected SHA-256 for the given Go version + current platform.
 * Returns `undefined` when the version isn't present in {@link versionMap}
 * (user-specified patch releases, release candidates, or toolchain pins that
 * we do not vouch for).
 */
function lookupGoSha256(
  version: string,
  platformKey: string
): string | undefined {
  for (const entry of versionMap.values()) {
    if (entry.version === version) {
      return entry.sha256[platformKey];
    }
  }
  return undefined;
}

export const goGlobalCachePath = join(
  XDGAppPaths('com.vercel.cli').cache(),
  'golang'
);

export const OUT_EXTENSION = process.platform === 'win32' ? '.exe' : '';

interface Analyzed {
  functionName: string;
  packageName: string;
  watch?: boolean;
}

type GoCommandError = Error & {
  all?: string;
  stderr?: string;
  stdout?: string;
};

function getGoCommandOutput(error: GoCommandError) {
  const stderr = error.stderr?.trim();
  const stdout = error.stdout?.trim();
  const all = error.all?.trim();

  if (stderr && stdout && stdout !== stderr) {
    return `stderr:\n${stderr}\n\nstdout:\n${stdout}`;
  }

  return stderr || stdout || all;
}

function enrichGoCommandError(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  const output = getGoCommandOutput(error as GoCommandError);
  if (!output || error.message.includes(output)) {
    return error;
  }

  error.message = `${error.message}\n\n${output}`;
  return error;
}

/**
 * Parses the AST of the specified entrypoint Go file.
 * @param workPath The work path (e.g. `/path/to/project`)
 * @param entrypoint The path to the entrypoint file (e.g.
 * `/path/to/project/api/index.go`)
 * @param modulePath The path to the directory containing the `go.mod` (e.g.
 * `/path/to/project/api`)
 * @returns The results from the AST parsing
 */
export async function getAnalyzedEntrypoint({
  entrypoint,
  modulePath,
  workPath,
  isDev,
}: {
  entrypoint: string;
  modulePath?: string;
  workPath: string;
  isDev?: boolean;
}): Promise<Analyzed> {
  const bin = join(__dirname, `analyze${OUT_EXTENSION}`);
  let analyzed: string;

  try {
    // build the `analyze` binary if not found in the `dist` directory
    const isAnalyzeExist = await pathExists(bin);
    if (!isAnalyzeExist) {
      debug(`Building analyze bin: ${bin}`);
      const src = join(__dirname, '../analyze.go');
      let go;
      const createOpts = {
        modulePath,
        opts: { cwd: __dirname },
        workPath,
        isDev,
      };
      try {
        go = await createGo(createOpts);
      } catch (err) {
        // if the version in the `go.mod` is too old, then download the latest
        if (
          err instanceof GoError &&
          err.code === 'ERR_UNSUPPORTED_GO_VERSION'
        ) {
          delete createOpts.modulePath;
          go = await createGo(createOpts);
        } else {
          throw err;
        }
      }
      await go.build(src, bin);
    }
  } catch (err) {
    console.error('Failed to build the Go AST analyzer');
    throw err;
  }

  try {
    debug(`Analyzing entrypoint ${entrypoint} with modulePath ${modulePath}`);
    const args = [`-modpath=${modulePath}`, join(workPath, entrypoint)];
    analyzed = await execa.stdout(bin, args);
  } catch (err) {
    console.error(`Failed to parse AST for "${entrypoint}"`);
    throw err;
  }

  debug(`Analyzed entrypoint ${analyzed}`);

  if (!analyzed) {
    const err = new Error(
      `Could not find an exported function in "${entrypoint}"
Learn more: https://vercel.com/docs/functions/serverless-functions/runtimes/go
      `
    );
    console.error(err.message);
    throw err;
  }

  return JSON.parse(analyzed) as Analyzed;
}

export class GoWrapper {
  private env: Env;
  private opts: execa.Options;

  constructor(env: Env, opts: execa.Options = {}) {
    if (!opts.cwd) {
      opts.cwd = process.cwd();
    }
    this.env = env;
    this.opts = opts;
  }

  private async execute(...args: string[]) {
    const { opts, env } = this;
    debug(
      `Exec: go ${args.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`
    );
    debug(`  CWD=${opts.cwd}`);
    debug(`  GOROOT=${(env || opts.env).GOROOT}`);
    debug(`  GO_BUILD_FLAGS=${(env || opts.env).GO_BUILD_FLAGS}`);

    const captureAndForwardOutput =
      opts.stdio === undefined || opts.stdio === 'inherit';
    const subprocess = execa('go', args, {
      ...opts,
      env,
      stdio: captureAndForwardOutput ? 'pipe' : opts.stdio,
    });

    if (captureAndForwardOutput) {
      subprocess.stdout?.pipe(process.stdout);
      subprocess.stderr?.pipe(process.stderr);
    }

    try {
      return await subprocess;
    } catch (error) {
      throw enrichGoCommandError(error);
    }
  }

  mod({ tolerateErrors = false } = {}) {
    const args = ['mod', 'tidy'];
    if (tolerateErrors) {
      args.push('-e');
    }
    return this.execute(...args);
  }

  vendor() {
    return this.execute('mod', 'vendor');
  }

  get(src?: string) {
    const args = ['get'];
    if (src) {
      debug(`Fetching 'go' dependencies for file ${src}`);
      args.push(src);
    } else {
      debug(`Fetching 'go' dependencies for cwd ${this.opts.cwd}`);
    }
    return this.execute(...args);
  }

  build(src: string | string[], dest: string, { vendorMode = false } = {}) {
    debug(`Building optimized 'go' binary ${src} -> ${dest}`);
    const sources = Array.isArray(src) ? src : [src];

    const envGoBuildFlags = (this.env || this.opts.env).GO_BUILD_FLAGS;
    const flags = envGoBuildFlags ? stringArgv(envGoBuildFlags) : [...GO_FLAGS];

    if (vendorMode && !envGoBuildFlags) {
      flags.push('-mod=vendor');
    }

    return this.execute('build', ...flags, '-o', dest, ...sources);
  }
}

type CreateGoOptions = {
  modulePath?: string;
  opts?: execa.Options;
  workPath: string;
  /**
   * Whether this invocation comes from `vercel dev`. When true, Go versions
   * that are not in our pinned SHA-256 map may fall back to a system-installed
   * `go` of the same minor version. In `vercel build` the download is
   * strictly required and un-pinned versions fail fast.
   */
  isDev?: boolean;
};

/**
 * Initializes a `GoWrapper` instance.
 *
 * This function determines the Go version to use by first looking in the
 * `go.mod`, if exists, otherwise uses the latest version from the version
 * map.
 *
 * Next it will attempt to find the desired Go version by checking the
 * following locations:
 *   1. The "local" project cache directory (e.g. `.vercel/cache/golang`)
 *   2. The "global" cache directory (e.g. `~/.cache/com.vercel.com/golang`)
 *   3. The system PATH
 *
 * If the Go version is not found, it's downloaded and installed in the
 * global cache directory so it can be shared across projects. When using
 * Linux or macOS, it creates a symlink from the global cache to the local
 * cache directory so that `prepareCache` will persist it.
 *
 * @param modulePath The path possibly containing a `go.mod` file
 * @param opts `execa` options (`cwd`, `env`, `stdio`, etc)
 * @param workPath The path to the project to be built
 * @returns An initialized `GoWrapper` instance
 */
export async function createGo({
  modulePath,
  opts = {},
  workPath,
  isDev = false,
}: CreateGoOptions): Promise<GoWrapper> {
  // parse the `go.mod`, if exists
  let goPreferredVersion: GoVersions | undefined;
  if (modulePath) {
    goPreferredVersion = await parseGoModVersionFromModule(modulePath);
  }

  // default to newest (first) supported go version
  const goSelectedVersion = goPreferredVersion
    ? goPreferredVersion.toolchain || goPreferredVersion.go
    : Array.from(versionMap.values())[0].version;

  const env = cloneEnv(process.env, opts.env);
  const { PATH } = env;
  const { platform } = process;
  const goGlobalCacheDir = join(
    goGlobalCachePath,
    `${goSelectedVersion}_${platform}_${process.arch}`
  );
  const goCacheDir = join(workPath, localCacheDir);

  if (goPreferredVersion) {
    debug(`Preferred go version ${goSelectedVersion} (from go.mod)`);
    env.GO111MODULE = 'on';
  } else {
    debug(
      `Preferred go version ${goSelectedVersion} (latest from version map)`
    );
  }

  const setGoEnv = async (goDir: string | null) => {
    if (!goDir) {
      env.GOROOT = undefined;
      env.PATH = PATH;
      return;
    }

    const isUnix = platform !== 'win32';

    const setEnvPaths = (modCache: string, buildCache: string) => {
      env.GOMODCACHE = modCache;
      env.GOCACHE = buildCache;
      debug(`Set GOMODCACHE to ${env.GOMODCACHE}`);
      debug(`Set GOCACHE to ${env.GOCACHE}`);
    };

    if (isUnix && goDir === goGlobalCacheDir) {
      // Using global cache → link it to goCacheDir
      debug(`Symlinking ${goDir} -> ${goCacheDir}`);
      await remove(goCacheDir);
      await mkdirp(dirname(goCacheDir));
      await symlink(goDir, goCacheDir);

      const modCache = join(goDir, 'pkg', 'mod');
      const buildCache = join(goDir, 'go-build');
      setEnvPaths(modCache, buildCache);

      goDir = goCacheDir;
    } else if (isUnix && goDir === goCacheDir) {
      // Using local cache → link temp writable directories
      // Use deterministic path based on workPath so all function builds
      // within the same deployment share the same cache paths
      const hash = createHash('md5').update(workPath).digest('hex').slice(0, 8);
      const tmpBase = join(tmpdir(), `vercel-go-cache-${hash}`);
      const tmpModCache = join(tmpBase, 'mod');
      const tmpBuildCache = join(tmpBase, 'go-build');

      await mkdirp(join(goDir, 'pkg', 'mod'));
      await mkdirp(join(goDir, 'go-build'));

      // Create symlinks (remove first to handle broken symlinks)
      await mkdirp(tmpBase);
      await remove(tmpModCache);
      await symlink(join(goCacheDir, 'pkg', 'mod'), tmpModCache);
      await remove(tmpBuildCache);
      await symlink(join(goCacheDir, 'go-build'), tmpBuildCache);

      setEnvPaths(tmpModCache, tmpBuildCache);
    }

    env.GOROOT = goDir;
    env.PATH = `${join(goDir, 'bin')}${delimiter}${PATH}`;
  };

  // try each of these Go directories looking for the version we need
  const goDirs = {
    'local cache': goCacheDir,
    'global cache': goGlobalCacheDir,
    'system PATH': null,
  };

  for (const [label, goDir] of Object.entries(goDirs)) {
    try {
      const goBinDir = goDir && join(goDir, 'bin');
      if (goBinDir && !(await pathExists(goBinDir))) {
        debug(`Go not found in ${label}`);
        continue;
      }

      env.GOROOT = goDir || undefined;
      env.PATH = goBinDir || PATH;

      const { stdout } = await execa('go', ['version'], { env });
      const { major, minor, short, version } = parseGoVersionString(stdout);

      if (
        major < GO_MIN_MAJOR_VERSION ||
        (major === GO_MIN_MAJOR_VERSION && minor < GO_MIN_MINOR_VERSION)
      ) {
        debug(`Found go ${version} in ${label}, but version is unsupported`);
      }
      if (version === goSelectedVersion || short === goSelectedVersion) {
        debug(`Selected go ${version} (from ${label})`);

        await setGoEnv(goDir);
        return new GoWrapper(env, opts);
      } else {
        debug(`Found go ${version} in ${label}, but need ${goSelectedVersion}`);
      }
    } catch {
      debug(`Go not found in ${label}`);
    }
  }

  // we need to download and cache the desired `go` version. Fall back to a
  // system-installed Go under `vercel dev` when the requested version has no
  // pinned SHA-256 in this builder.
  try {
    await download({
      dest: goGlobalCacheDir,
      version: goSelectedVersion,
    });
  } catch (err) {
    if (
      isDev &&
      err instanceof GoError &&
      err.code === 'ERR_GO_SHA_UNAVAILABLE'
    ) {
      const systemGoDir = await findSystemGoSatisfying(goSelectedVersion, {
        ...env,
        PATH,
      });
      if (systemGoDir) {
        console.warn(
          `Warning: Go ${goSelectedVersion} is not in the @vercel/go pinned SHA map; using the system Go toolchain because \`vercel dev\` was detected. Do not rely on this path in production builds.`
        );
        env.GOROOT = systemGoDir || undefined;
        env.PATH = systemGoDir
          ? `${join(systemGoDir, 'bin')}${delimiter}${PATH}`
          : PATH;
        return new GoWrapper(env, opts);
      }
    }
    throw err;
  }

  await setGoEnv(goGlobalCacheDir);
  return new GoWrapper(env, opts);
}

/**
 * In `vercel dev`, fall back to a system-installed `go` binary when the
 * requested version is not in the pinned SHA-256 map. The match is relaxed
 * to the major.minor pair — a user pinning `go 1.22.5` will accept a local
 * `go 1.22.x` rather than insisting on an exact patch.
 */
async function findSystemGoSatisfying(
  requestedVersion: string,
  env: NodeJS.ProcessEnv
): Promise<string | null> {
  const match = /^(\d+)\.(\d+)/.exec(requestedVersion);
  if (!match) {
    return null;
  }
  const requestedShort = `${match[1]}.${match[2]}`;
  try {
    const { stdout } = await execa('go', ['version'], { env });
    const { short } = parseGoVersionString(stdout);
    if (short !== requestedShort) {
      return null;
    }
    const { stdout: goroot } = await execa('go', ['env', 'GOROOT'], { env });
    const trimmed = goroot.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

/**
 * Download and installs the Go distribution.
 *
 * @param dest The directory to install Go into. If directory exists, it is
 * first deleted before installing.
 * @param version The Go version to download
 */
async function download({ dest, version }: { dest: string; version: string }) {
  const { filename, url, platformKey } = getGoUrl(version);
  const expectedSha256 = lookupGoSha256(version, platformKey);
  if (!expectedSha256) {
    const err = new GoError(
      `Go ${version} (${platformKey}) is not pinned in the @vercel/go SHA-256 map. Refusing to install an unverified toolchain. Pin a supported version in go.mod or add the SHA-256 to the builder's versionMap.`
    );
    err.code = 'ERR_GO_SHA_UNAVAILABLE';
    throw err;
  }

  console.log(`Downloading go: ${url}`);

  const stagingDir = join(tmpdir(), `vercel-go-download-${process.pid}`);
  await mkdirp(stagingDir);
  const archivePath = join(stagingDir, filename);

  try {
    const downloader = new VerifiedDownloader({ sha256: expectedSha256 });
    await downloader.downloadTo(url, archivePath);

    debug(`Installing go ${version} to ${dest}`);

    await remove(dest);
    await mkdirp(dest);

    if (/\.zip$/.test(filename)) {
      await extractZip(archivePath, dest, { strip: 1 });
      return;
    }

    await streamPipeline(
      createReadStream(archivePath),
      extract({ cwd: dest, strip: 1 })
    );
  } finally {
    await remove(stagingDir);
  }
}

const goVersionRegExp = /(\d+)\.(\d+)(?:\.(\d+))?/;

/**
 * Parses the raw output from `go version` and returns the version parts.
 *
 * @param goVersionOutput The output from `go version`
 */
function parseGoVersionString(goVersionOutput: string) {
  const matches = goVersionOutput.match(goVersionRegExp) || [];
  const major = parseInt(matches[1], 10);
  const minor = parseInt(matches[2], 10);
  const patch = parseInt(matches[3] || '0', 10);
  return {
    version: `${major}.${minor}.${patch}`,
    short: `${major}.${minor}`,
    major,
    minor,
    patch,
  };
}

class GoError extends Error {
  code: string | undefined;
}

interface GoVersions {
  go: string;
  toolchain?: string;
}

/**
 * Attempts to parse the preferred Go version from the `go.mod` file.
 *
 * @param modulePath The directory containing the `go.mod` file
 * @returns
 */
async function parseGoModVersionFromModule(
  modulePath: string
): Promise<GoVersions | undefined> {
  let version: GoVersions | undefined;
  const file = join(modulePath, 'go.mod');

  try {
    const content = await readFile(file, 'utf8');
    version = parseGoModVersion(content);
    if (!version) {
      console.log(`Warning: Unknown Go version in ${file}`);
    }
  } catch (err: any) {
    if (typeof err === 'object' && err.code === 'ENOENT') {
      debug(`File not found: ${file}`);
      return undefined;
    } else {
      throw err;
    }
  }

  return version;
}

/**
 * Attempts to parse the preferred Go version from the `go.mod` file.
 *
 * @param content The content of the `go.mod` file
 * @returns The version in { go: `${major}.${minor}.${patch}`, toolchain: `${major}.${minor}.${patch}` | undefined } format, or undefined if no version was found
 * @throws GoError If the go version is not supported
 */
export function parseGoModVersion(content: string): GoVersions | undefined {
  const goMatches = /^\s*go\s+(\d+)\.(\d+)(?:\.(\d+))?\s*(?:\/\/.*)?$/gm.exec(
    content
  );
  if (!goMatches) {
    return undefined;
  }
  const major = parseInt(goMatches[1], 10);
  const minor = parseInt(goMatches[2], 10);
  const patch = goMatches[3] && parseInt(goMatches[3], 10);
  // Accept stable `1.X[.Y]` versions and optional `-rcN` / `-betaN`
  // pre-release suffixes, matching the official Go toolchain version grammar.
  // Anything else (arbitrary suffixes like `_foo` or URL-unsafe characters)
  // is rejected so the resolved version cannot be attacker-shaped into the
  // download URL.
  const toolchainMatches =
    /^\s*toolchain\s+go((\d+)\.(\d+)(?:\.(\d+))?(?:rc\d+|beta\d+)?)\s*(?:\/\/.*)?$/gm.exec(
      content
    );
  const toolchain = toolchainMatches ? toolchainMatches[1] : undefined;
  if (major >= GO_MIN_MAJOR_VERSION && minor >= GO_MIN_MINOR_VERSION) {
    // Special case handle `patch` is provided and 0
    if (patch || patch === 0) {
      return {
        go: `${major}.${minor}.${patch}`,
        toolchain,
      };
    }
    const full = versionMap.get(`${major}.${minor}`);
    if (full) {
      return {
        go: full.version,
        toolchain,
      };
    }
  }
  const err = new GoError(`Unsupported Go version ${major}.${minor}`);
  err.code = 'ERR_UNSUPPORTED_GO_VERSION';
  throw err;
}
