import { createWriteStream } from 'fs';
import { get as httpsGet } from 'https';
import { access, cp, mkdir, mkdtemp, readFile, rename, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { delimiter, dirname, join } from 'path';
import execa from 'execa';
import { cloneEnv, debug, glob, type Files } from '@vercel/build-utils';

const RELEASES_INDEX_URL =
  'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json';

export const localCacheDir = join('.vercel', 'cache', 'dotnet');

const sdkCacheDir = join(localCacheDir, 'sdk');

type RequestedDotnetSdk =
  | {
      kind: 'version';
      version: string;
      source: string;
    }
  | {
      kind: 'channel';
      channel: string;
      source: string;
    };

type ParsedDotnetVersion = {
  version: string;
  major: number;
  minor: number;
  patch: number;
};

type ReleasesIndex = {
  'releases-index': Array<{
    'channel-version': string;
    'latest-sdk'?: string;
  }>;
};

let releasesIndexPromise: Promise<ReleasesIndex['releases-index']> | undefined;

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function parseGlobalJsonSdkVersion(
  contents: string
): string | undefined {
  const parsed = JSON.parse(contents) as {
    sdk?: {
      version?: string;
    };
  };
  const version = parsed.sdk?.version?.trim();
  return version || undefined;
}

export function parseTargetFrameworkChannels(contents: string): string[] {
  const channels = new Set<string>();
  const targetFrameworkTag = /<TargetFrameworks?>([^<]+)<\/TargetFrameworks?>/g;
  let match: RegExpExecArray | null;

  while ((match = targetFrameworkTag.exec(contents))) {
    for (const framework of match[1].split(';')) {
      const frameworkMatch = framework.trim().match(/^net(\d+)\.(\d+)$/);
      if (frameworkMatch) {
        channels.add(`${frameworkMatch[1]}.${frameworkMatch[2]}`);
      }
    }
  }

  return Array.from(channels).sort((left, right) => {
    const [leftMajor, leftMinor] = left.split('.').map(part => Number(part));
    const [rightMajor, rightMinor] = right.split('.').map(part => Number(part));

    if (leftMajor !== rightMajor) {
      return rightMajor - leftMajor;
    }

    return rightMinor - leftMinor;
  });
}

export function parseDotnetVersion(version: string): ParsedDotnetVersion {
  const trimmed = version.trim();
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].+)?$/.exec(trimmed);
  if (!match) {
    throw new Error(`Unable to parse .NET SDK version: ${version}`);
  }

  return {
    version: `${match[1]}.${match[2]}.${match[3]}`,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

async function findGlobalJsonPath(
  projectDir: string,
  workPath: string
): Promise<string | undefined> {
  let dir = projectDir;

  while (true) {
    const globalJsonPath = join(dir, 'global.json');
    if (await pathExists(globalJsonPath)) {
      return globalJsonPath;
    }

    if (dir === workPath) {
      return undefined;
    }

    const parentDir = dirname(dir);
    if (parentDir === dir) {
      return undefined;
    }
    dir = parentDir;
  }
}

async function resolveRequestedDotnetSdk(
  csprojPath: string,
  workPath: string
): Promise<RequestedDotnetSdk> {
  const projectDir = dirname(csprojPath);
  const globalJsonPath = await findGlobalJsonPath(projectDir, workPath);

  if (globalJsonPath) {
    const globalJson = await readFile(globalJsonPath, 'utf8');
    const version = parseGlobalJsonSdkVersion(globalJson);
    if (version) {
      return {
        kind: 'version',
        version,
        source: `global.json (${globalJsonPath})`,
      };
    }
  }

  const csprojContents = await readFile(csprojPath, 'utf8');
  const channels = parseTargetFrameworkChannels(csprojContents);
  if (channels.length > 0) {
    return {
      kind: 'channel',
      channel: channels[0],
      source: `${csprojPath} TargetFramework`,
    };
  }

  throw new Error(
    `Could not determine a .NET SDK version for ${csprojPath}. Add a supported <TargetFramework> or a global.json with sdk.version.`
  );
}

async function fetchJson<T>(url: string, redirects = 0): Promise<T> {
  if (redirects > 5) {
    throw new Error(`Too many redirects while fetching ${url}`);
  }

  return new Promise<T>((resolve, reject) => {
    const request = httpsGet(url, response => {
      const statusCode = response.statusCode || 0;
      const location = response.headers.location;

      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        fetchJson<T>(new URL(location, url).toString(), redirects + 1).then(
          resolve,
          reject
        );
        return;
      }

      if (statusCode !== 200) {
        response.resume();
        reject(new Error(`Failed to fetch ${url} (${statusCode})`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', chunk => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
        } catch (error) {
          reject(error);
        }
      });
      response.on('error', reject);
    });

    request.on('error', reject);
  });
}

async function getReleasesIndex(): Promise<ReleasesIndex['releases-index']> {
  if (!releasesIndexPromise) {
    releasesIndexPromise = fetchJson<ReleasesIndex>(RELEASES_INDEX_URL).then(
      response => response['releases-index']
    );
  }

  return releasesIndexPromise;
}

async function resolveSdkVersion(channel: string): Promise<string> {
  const releasesIndex = await getReleasesIndex();
  const release = releasesIndex.find(
    entry => entry['channel-version'] === channel
  );

  if (!release?.['latest-sdk']) {
    throw new Error(
      `Unable to resolve the latest .NET SDK for channel ${channel}`
    );
  }

  return release['latest-sdk'];
}

function getDotnetArchiveInfo(version: string) {
  const arch =
    process.arch === 'x64'
      ? 'x64'
      : process.arch === 'arm64'
        ? 'arm64'
        : undefined;
  if (!arch) {
    throw new Error(`Unsupported architecture for .NET SDK: ${process.arch}`);
  }

  const os =
    process.platform === 'linux'
      ? 'linux'
      : process.platform === 'darwin'
        ? 'osx'
        : process.platform === 'win32'
          ? 'win'
          : undefined;
  if (!os) {
    throw new Error(`Unsupported platform for .NET SDK: ${process.platform}`);
  }

  const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
  const filename = `dotnet-sdk-${version}-${os}-${arch}.${ext}`;

  return {
    filename,
    url: `https://builds.dotnet.microsoft.com/dotnet/Sdk/${version}/${filename}`,
  };
}

function getDotnetBinaryPath(dotnetRoot: string): string {
  return join(
    dotnetRoot,
    process.platform === 'win32' ? 'dotnet.exe' : 'dotnet'
  );
}

async function getInstalledDotnetVersion(
  command: string,
  env: NodeJS.ProcessEnv
): Promise<string | undefined> {
  try {
    const { stdout } = await execa(command, ['--version'], { env });
    return parseDotnetVersion(stdout).version;
  } catch {
    return undefined;
  }
}

async function downloadFile(
  url: string,
  filePath: string,
  redirects = 0
): Promise<void> {
  if (redirects > 5) {
    throw new Error(`Too many redirects while downloading ${url}`);
  }

  return new Promise<void>((resolve, reject) => {
    const request = httpsGet(url, response => {
      const statusCode = response.statusCode || 0;
      const location = response.headers.location;

      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        downloadFile(
          new URL(location, url).toString(),
          filePath,
          redirects + 1
        ).then(resolve, reject);
        return;
      }

      if (statusCode !== 200) {
        response.resume();
        reject(new Error(`Failed to download ${url} (${statusCode})`));
        return;
      }

      const output = createWriteStream(filePath);
      output.on('error', reject);
      response.on('error', reject);
      output.on('finish', () => {
        output.close(error => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      response.pipe(output);
    });

    request.on('error', reject);
  });
}

async function extractArchive(
  archivePath: string,
  dest: string
): Promise<void> {
  if (process.platform === 'win32') {
    const quotedArchivePath = archivePath.replace(/'/g, "''");
    const quotedDest = dest.replace(/'/g, "''");
    await execa(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -Path '${quotedArchivePath}' -DestinationPath '${quotedDest}' -Force`,
      ],
      { stdio: 'inherit' }
    );
    return;
  }

  await execa('tar', ['-xzf', archivePath, '-C', dest], { stdio: 'inherit' });
}

async function installDotnetSdk(version: string, dest: string): Promise<void> {
  const { filename, url } = getDotnetArchiveInfo(version);
  const tempDir = await mkdtemp(join(tmpdir(), 'vercel-dotnet-sdk-'));
  const archivePath = join(tempDir, filename);
  const extractedPath = join(tempDir, 'extracted');

  console.log(`Downloading dotnet SDK ${version}: ${url}`);

  try {
    await downloadFile(url, archivePath);
    await mkdir(extractedPath, { recursive: true });
    await extractArchive(archivePath, extractedPath);
    await rm(dest, { recursive: true, force: true });
    await mkdir(dirname(dest), { recursive: true });
    try {
      await rename(extractedPath, dest);
    } catch (error: any) {
      if (error?.code !== 'EXDEV') {
        throw error;
      }

      await cp(extractedPath, dest, { recursive: true });
      await rm(extractedPath, { recursive: true, force: true });
    }
  } catch (error) {
    await rm(dest, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function createDotnet({
  csprojPath,
  workPath,
  opts = {},
}: {
  csprojPath: string;
  workPath: string;
  opts?: execa.Options;
}): Promise<{
  dotnetPath: string;
  env: NodeJS.ProcessEnv;
  sdkVersion: string;
  cleanup: () => Promise<void>;
}> {
  const requestedSdk = await resolveRequestedDotnetSdk(csprojPath, workPath);
  const sdkVersion =
    requestedSdk.kind === 'version'
      ? requestedSdk.version
      : await resolveSdkVersion(requestedSdk.channel);

  debug(`Selected .NET SDK ${sdkVersion} from ${requestedSdk.source}`);

  const sessionDir = await mkdtemp(join(tmpdir(), 'vercel-dotnet-session-'));
  const nugetPackagesPath = join(sessionDir, 'nuget', 'packages');
  const nugetHttpCachePath = join(sessionDir, 'nuget', 'http-cache');
  const cliHomePath = join(sessionDir, 'home');
  const sdkRoot = join(workPath, sdkCacheDir);
  const cachedDotnetPath = getDotnetBinaryPath(sdkRoot);

  await Promise.all([
    mkdir(nugetPackagesPath, { recursive: true }),
    mkdir(nugetHttpCachePath, { recursive: true }),
    mkdir(cliHomePath, { recursive: true }),
    mkdir(dirname(sdkRoot), { recursive: true }),
  ]);

  const baseEnv = cloneEnv(process.env, opts.env, {
    DOTNET_CLI_HOME: cliHomePath,
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_NOLOGO: '1',
    NUGET_HTTP_CACHE_PATH: nugetHttpCachePath,
    NUGET_PACKAGES: nugetPackagesPath,
  });
  const basePath = baseEnv.PATH || process.env.PATH || '';

  debug(`Using ephemeral .NET CLI state in ${sessionDir}`);

  const cleanup = async () => {
    await rm(sessionDir, { recursive: true, force: true });
  };

  const getEnv = (dotnetRoot?: string): NodeJS.ProcessEnv => {
    const env = { ...baseEnv };
    if (dotnetRoot) {
      const dotnetBinary = getDotnetBinaryPath(dotnetRoot);
      env.DOTNET_HOST_PATH = dotnetBinary;
      env.DOTNET_ROOT = dotnetRoot;
      env.PATH = `${dotnetRoot}${delimiter}${basePath}`;
    } else {
      delete env.DOTNET_HOST_PATH;
      delete env.DOTNET_ROOT;
      env.PATH = basePath;
    }
    return env;
  };

  if (await pathExists(cachedDotnetPath)) {
    const cachedVersion = await getInstalledDotnetVersion(
      cachedDotnetPath,
      getEnv(sdkRoot)
    );
    if (cachedVersion === sdkVersion) {
      debug(`Using cached .NET SDK ${cachedVersion} from ${sdkRoot}`);
      return {
        dotnetPath: cachedDotnetPath,
        env: getEnv(sdkRoot),
        sdkVersion,
        cleanup,
      };
    }

    debug(
      `Discarding cached .NET SDK at ${sdkRoot}; expected ${sdkVersion}, found ${cachedVersion}`
    );
    await rm(sdkRoot, { recursive: true, force: true });
  }

  const systemVersion = await getInstalledDotnetVersion('dotnet', getEnv());
  if (systemVersion === sdkVersion) {
    debug(`Using system .NET SDK ${systemVersion}`);
    return {
      dotnetPath: 'dotnet',
      env: getEnv(),
      sdkVersion,
      cleanup,
    };
  }

  await installDotnetSdk(sdkVersion, sdkRoot);

  const installedVersion = await getInstalledDotnetVersion(
    cachedDotnetPath,
    getEnv(sdkRoot)
  );
  if (installedVersion !== sdkVersion) {
    throw new Error(
      `Installed .NET SDK version mismatch. Expected ${sdkVersion}, found ${installedVersion}`
    );
  }

  debug(`Installed .NET SDK ${installedVersion} to ${sdkRoot}`);

  return {
    dotnetPath: cachedDotnetPath,
    env: getEnv(sdkRoot),
    sdkVersion,
    cleanup,
  };
}

export async function prepareDotnetCache({
  workPath,
}: {
  workPath: string;
}): Promise<Files> {
  return glob(`${sdkCacheDir}/**`, workPath);
}
