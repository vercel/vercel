import { FilesMap } from './hashes';
import { join, sep, relative, basename } from 'path';
import { URL } from 'url';
import ignore from 'ignore';
import { pkgVersion } from '../pkg';
import { NowBuildError } from '@vercel/build-utils';
import { VercelClientOptions, VercelConfig } from '../types';
import { Sema } from 'async-sema';
import { readFile } from 'fs-extra';
import readdir from './readdir-recursive';
import {
  findConfig as findMicrofrontendsConfig,
  inferMicrofrontendsLocation,
} from '@vercel/microfrontends/microfrontends/utils';

type Ignore = ReturnType<typeof ignore>;

const semaphore = new Sema(10);

export const API_FILES = '/v2/files';

const EVENTS_ARRAY = [
  // File events
  'hashes-calculated',
  'file-count',
  'file-uploaded',
  'all-files-uploaded',
  // Deployment events
  'created',
  'building',
  'ready',
  'alias-assigned',
  'warning',
  'error',
  'notice',
  'tip',
  'canceled',
  // Checks events
  'checks-registered',
  'checks-completed',
  'checks-running',
  'checks-conclusion-succeeded',
  'checks-conclusion-failed',
  'checks-conclusion-skipped',
  'checks-conclusion-canceled',
] as const;

export type DeploymentEventType = (typeof EVENTS_ARRAY)[number];
export const EVENTS = new Set(EVENTS_ARRAY);

export function getApiDeploymentsUrl() {
  return '/v13/deployments';
}

export async function parseVercelConfig(
  filePath?: string
): Promise<VercelConfig> {
  if (!filePath) {
    return {};
  }

  try {
    const jsonString = await readFile(filePath, 'utf8');

    return JSON.parse(jsonString);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);

    return {};
  }
}

const maybeRead = async function <T>(path: string, default_: T) {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    return default_;
  }
};

export async function buildFileTree(
  path: string | string[],
  {
    isDirectory,
    prebuilt,
    vercelOutputDir,
    rootDirectory,
    projectName,
    bulkRedirectsPath,
  }: Pick<
    VercelClientOptions,
    | 'isDirectory'
    | 'prebuilt'
    | 'vercelOutputDir'
    | 'rootDirectory'
    | 'projectName'
    | 'bulkRedirectsPath'
  >,
  debug: Debug
): Promise<{ fileList: string[]; ignoreList: string[] }> {
  const ignoreList: string[] = [];
  let fileList: string[];
  let { ig, ignores } = await getVercelIgnore(path, prebuilt, vercelOutputDir);

  debug(`Found ${ignores.length} rules in .vercelignore`);
  debug('Building file tree...');

  if (isDirectory && !Array.isArray(path)) {
    // Directory path
    const ignores = (absPath: string) => {
      const rel = relative(path, absPath);
      const ignored = ig.ignores(rel);
      if (ignored) {
        ignoreList.push(rel);
      }
      return ignored;
    };
    fileList = await readdir(path, [ignores]);

    // Check for special files that should be included even if ignored
    const refs = new Set<string>();

    if (prebuilt) {
      // Traverse over the `.vc-config.json` files and include
      // the files referenced by the "filePathMap" properties
      const vcConfigFilePaths = fileList.filter(
        file => basename(file) === '.vc-config.json'
      );
      await Promise.all(
        vcConfigFilePaths.map(async p => {
          const configJson = await readFile(p, 'utf8');
          const config = JSON.parse(configJson);
          if (!config.filePathMap) return;
          for (const v of Object.values(config.filePathMap) as string[]) {
            refs.add(join(path, v));
          }
        })
      );

      try {
        let microfrontendConfigPath = findMicrofrontendsConfig({
          dir: join(path, rootDirectory || ''),
        });
        if (!microfrontendConfigPath && !rootDirectory && projectName) {
          microfrontendConfigPath = findMicrofrontendsConfig({
            dir: inferMicrofrontendsLocation({
              repositoryRoot: path,
              applicationName: projectName,
            }),
          });
        }
        if (microfrontendConfigPath) {
          refs.add(microfrontendConfigPath);
        }
      } catch (e) {
        debug(`Error detecting microfrontend config: ${e}`);
      }
    }

    // Check for .vercel/routes.json and include it if it exists
    try {
      const routesJsonPath = join(path, '.vercel', 'routes.json');
      const routesJsonContent = await maybeRead(routesJsonPath, null);
      if (routesJsonContent !== null) {
        refs.add(routesJsonPath);
        debug('Including .vercel/routes.json in deployment');
      }
    } catch (e) {
      debug(`Error checking for .vercel/routes.json: ${e}`);
    }

    // Include bulkRedirectsPath file if specified (for prebuilt deployments)
    if (prebuilt && bulkRedirectsPath) {
      try {
        const projectRoot = path;
        const bulkRedirectsFullPath = join(
          projectRoot,
          rootDirectory || '',
          bulkRedirectsPath
        );

        // Validate that the resolved path stays within the project root
        const relativeFromRoot = relative(projectRoot, bulkRedirectsFullPath);
        if (relativeFromRoot.startsWith('..')) {
          debug(
            `Skipping bulk redirects file "${bulkRedirectsPath}" - path traversal detected (resolves outside project root)`
          );
        } else {
          const bulkRedirectsContent = await maybeRead(
            bulkRedirectsFullPath,
            null
          );
          if (bulkRedirectsContent !== null) {
            refs.add(bulkRedirectsFullPath);
            debug(
              `Including bulk redirects file "${bulkRedirectsPath}" in deployment`
            );
          } else {
            debug(`Bulk redirects file "${bulkRedirectsPath}" not found`);
          }
        }
      } catch (e) {
        debug(`Error checking for bulk redirects file: ${e}`);
      }
    }

    if (refs.size > 0) {
      fileList = fileList.concat(Array.from(refs));
    }

    debug(`Found ${fileList.length} files in the specified directory`);
  } else if (Array.isArray(path)) {
    // Array of file paths
    fileList = path;
    debug(`Assigned ${fileList.length} files provided explicitly`);
  } else {
    // Single file
    fileList = [path];
    debug(`Deploying the provided path as single file`);
  }

  return { fileList, ignoreList };
}

export async function getVercelIgnore(
  cwd: string | string[],
  prebuilt?: boolean,
  vercelOutputDir?: string
): Promise<{ ig: Ignore; ignores: string[] }> {
  const ig = ignore();
  let ignores: string[];

  if (prebuilt) {
    if (typeof vercelOutputDir !== 'string') {
      throw new Error(
        `Missing required \`vercelOutputDir\` parameter when "prebuilt" is true`
      );
    }
    if (typeof cwd !== 'string') {
      throw new Error(`\`cwd\` must be a "string"`);
    }
    const relOutputDir = relative(cwd, vercelOutputDir);
    ignores = ['*'];
    const parts = relOutputDir.split(sep);
    parts.forEach((_, i) => {
      const level = parts.slice(0, i + 1).join('/');
      ignores.push(`!${level}`);
    });
    ignores.push(`!${parts.join('/')}/**`);
    ig.add(ignores.join('\n'));
  } else {
    ignores = [
      '.hg',
      '.git',
      '.gitmodules',
      '.svn',
      '.cache',
      '.next',
      '.now',
      '.vercel',
      '.npmignore',
      '.dockerignore',
      '.gitignore',
      '.*.swp',
      '.DS_Store',
      '.wafpicke-*',
      '.lock-wscript',
      '.env.local',
      '.env.*.local',
      '.venv',
      '.yarn/cache',
      '.pnp*',
      'npm-debug.log',
      'config.gypi',
      'node_modules',
      '__pycache__',
      'venv',
      'CVS',
    ];

    const cwds = Array.isArray(cwd) ? cwd : [cwd];

    const files = await Promise.all(
      cwds.map(async cwd => {
        const [vercelignore, nowignore] = await Promise.all([
          maybeRead(join(cwd, '.vercelignore'), ''),
          maybeRead(join(cwd, '.nowignore'), ''),
        ]);
        if (vercelignore && nowignore) {
          throw new NowBuildError({
            code: 'CONFLICTING_IGNORE_FILES',
            message:
              'Cannot use both a `.vercelignore` and `.nowignore` file. Please delete the `.nowignore` file.',
            link: 'https://vercel.link/combining-old-and-new-config',
          });
        }
        return vercelignore || nowignore;
      })
    );

    const ignoreFile = files.join('\n');

    ig.add(`${ignores.join('\n')}\n${clearRelative(ignoreFile)}`);
  }

  return { ig, ignores };
}

/**
 * Remove leading `./` from the beginning of ignores
 * because ignore doesn't like them :|
 */
function clearRelative(str: string) {
  return str.replace(/(\n|^)\.\//g, '$1');
}

interface FetchOpts extends RequestInit {
  apiUrl?: string;
  method?: string;
  teamId?: string;
  headers?: { [key: string]: any };
  userAgent?: string;
}

export const fetch = async (
  url: string,
  token: string,
  opts: FetchOpts = {},
  debugEnabled?: boolean
): Promise<any> => {
  semaphore.acquire();
  const debug = createDebug(debugEnabled);
  let time: number;

  url = `${opts.apiUrl || 'https://api.vercel.com'}${url}`;
  delete opts.apiUrl;

  const { VERCEL_TEAM_ID } = process.env;

  if (VERCEL_TEAM_ID) {
    url += `${url.includes('?') ? '&' : '?'}teamId=${VERCEL_TEAM_ID}`;
  }

  if (opts.teamId) {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set('teamId', opts.teamId);
    url = parsedUrl.toString();
    delete opts.teamId;
  }

  const userAgent = opts.userAgent || `client-v${pkgVersion}`;
  delete opts.userAgent;

  opts.headers = {
    ...opts.headers,
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    'user-agent': userAgent,
  };

  debug(`${opts.method || 'GET'} ${url}`);
  time = Date.now();
  const res = await fetch(url, opts);
  debug(`DONE in ${Date.now() - time}ms: ${opts.method || 'GET'} ${url}`);
  semaphore.release();

  return res;
};

export interface PreparedFile {
  file: string;
  sha?: string;
  size?: number;
  mode: number;
}

const isWin = process.platform.includes('win');

export const prepareFiles = (
  files: FilesMap,
  clientOptions: VercelClientOptions
): PreparedFile[] => {
  const preparedFiles: PreparedFile[] = [];
  for (const [sha, file] of files) {
    for (const name of file.names) {
      let fileName: string;

      if (clientOptions.isDirectory) {
        // Directory
        fileName =
          typeof clientOptions.path === 'string'
            ? relative(clientOptions.path, name)
            : name;
      } else {
        // Array of files or single file
        const segments = name.split(sep);
        fileName = segments[segments.length - 1];
      }

      preparedFiles.push({
        file: isWin ? fileName.replace(/\\/g, '/') : fileName,
        size: file.data?.byteLength || file.data?.length,
        mode: file.mode,
        sha: sha || undefined,
      });
    }
  }

  return preparedFiles;
};

export function createDebug(debug?: boolean) {
  if (debug) {
    return (...logs: string[]) => {
      process.stderr.write(
        [`[client-debug] ${new Date().toISOString()}`, ...logs].join(' ') + '\n'
      );
    };
  }

  return () => {};
}
type Debug = ReturnType<typeof createDebug>;
