import { DeploymentFile } from './hashes';
import { FetchOptions } from '@zeit/fetch';
import { nodeFetch, zeitFetch } from './fetch';
import { join, sep, relative } from 'path';
import { URL } from 'url';
import ignore from 'ignore';
type Ignore = ReturnType<typeof ignore>;
import { pkgVersion } from '../pkg';
import { NowBuildError } from '@vercel/build-utils';
import { NowClientOptions, DeploymentOptions, NowConfig } from '../types';
import { Sema } from 'async-sema';
import { readFile } from 'fs-extra';
import readdir from 'recursive-readdir';
const semaphore = new Sema(10);

export const API_FILES = '/v2/now/files';

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
] as const;

export type DeploymentEventType = typeof EVENTS_ARRAY[number];
export const EVENTS = new Set(EVENTS_ARRAY);

export function getApiDeploymentsUrl(
  metadata?: Pick<DeploymentOptions, 'builds' | 'functions'>
) {
  if (metadata && metadata.builds && !metadata.functions) {
    return '/v10/now/deployments';
  }

  return '/v13/now/deployments';
}

export async function parseVercelConfig(filePath?: string): Promise<NowConfig> {
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
  isDirectory: boolean,
  debug: Debug
): Promise<{ fileList: string[]; ignoreList: string[] }> {
  const ignoreList: string[] = [];
  let fileList: string[];
  let { ig, ignores } = await getVercelIgnore(path);

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
  cwd: string | string[]
): Promise<{ ig: Ignore; ignores: string[] }> {
  const ignores: string[] = [
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
    'npm-debug.log',
    'config.gypi',
    'node_modules',
    '__pycache__',
    'venv',
    'CVS',
    '.vercel_build_output',
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

  const ig = ignore().add(
    `${ignores.join('\n')}\n${clearRelative(ignoreFile)}`
  );

  return { ig, ignores };
}

/**
 * Remove leading `./` from the beginning of ignores
 * because ignore doesn't like them :|
 */
function clearRelative(str: string) {
  return str.replace(/(\n|^)\.\//g, '$1');
}

interface FetchOpts extends FetchOptions {
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
  debugEnabled?: boolean,
  useNodeFetch?: boolean
): Promise<any> => {
  semaphore.acquire();
  const debug = createDebug(debugEnabled);
  let time: number;

  url = `${opts.apiUrl || 'https://api.vercel.com'}${url}`;
  delete opts.apiUrl;

  if (opts.teamId) {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set('teamId', opts.teamId);
    url = parsedUrl.toString();
    delete opts.teamId;
  }

  const userAgent = opts.userAgent || `now-client-v${pkgVersion}`;
  delete opts.userAgent;

  opts.headers = {
    ...opts.headers,
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    'user-agent': userAgent,
  };

  debug(`${opts.method || 'GET'} ${url}`);
  time = Date.now();
  const res = useNodeFetch
    ? await nodeFetch(url, opts)
    : await zeitFetch(url, opts);
  debug(`DONE in ${Date.now() - time}ms: ${opts.method || 'GET'} ${url}`);
  semaphore.release();

  return res;
};

export interface PreparedFile {
  file: string;
  sha: string;
  size: number;
  mode: number;
}

const isWin = process.platform.includes('win');

export const prepareFiles = (
  files: Map<string, DeploymentFile>,
  clientOptions: NowClientOptions
): PreparedFile[] => {
  const preparedFiles = [...files.keys()].reduce(
    (acc: PreparedFile[], sha: string): PreparedFile[] => {
      const next = [...acc];

      const file = files.get(sha) as DeploymentFile;

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

        next.push({
          file: isWin ? fileName.replace(/\\/g, '/') : fileName,
          size: file.data.byteLength || file.data.length,
          mode: file.mode,
          sha,
        });
      }

      return next;
    },
    []
  );

  return preparedFiles;
};

export function createDebug(debug?: boolean) {
  if (debug) {
    return (...logs: string[]) => {
      process.stderr.write(
        [`[now-client-debug] ${new Date().toISOString()}`, ...logs].join(' ') +
          '\n'
      );
    };
  }

  return () => {};
}
type Debug = ReturnType<typeof createDebug>;
