import { URL } from 'url';
import ignore from 'ignore';
import { Sema } from 'async-sema';
import { readFile } from 'fs-extra';
import { pkgVersion } from '../pkg';
import { DeploymentFile } from './hashes';
import { FetchOptions } from '@zeit/fetch';
import { join, sep, relative } from 'path';
import { nodeFetch, zeitFetch } from './fetch';
import { NowClientOptions, DeploymentOptions, NowConfig } from '../types';

export const API_FILES = '/v2/now/files';

const semaphore = new Sema(10);

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

export type DeploymentEventType = (typeof EVENTS_ARRAY)[number];
export const EVENTS = new Set(EVENTS_ARRAY);

export function getApiDeploymentsUrl(
  metadata?: Pick<DeploymentOptions, 'builds' | 'functions'>
) {
  if (metadata && metadata.builds && !metadata.functions) {
    return '/v10/now/deployments';
  }

  return '/v12/now/deployments';
}

export async function parseNowJSON(filePath?: string): Promise<NowConfig> {
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

const maybeRead = async function<T>(path: string, default_: T) {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    return default_;
  }
};

export async function getNowIgnore(path: string | string[]): Promise<any> {
  let ignores: string[] = [
    '.hg',
    '.git',
    '.gitmodules',
    '.svn',
    '.cache',
    '.next',
    '.now',
    '.npmignore',
    '.dockerignore',
    '.gitignore',
    '.*.swp',
    '.DS_Store',
    '.wafpicke-*',
    '.lock-wscript',
    '.env',
    '.env.*',
    '.venv',
    'npm-debug.log',
    'config.gypi',
    'node_modules',
    '__pycache__/',
    'venv/',
    'CVS',
  ];

  const nowIgnore = Array.isArray(path)
    ? await maybeRead(
        join(
          path.find(fileName => fileName.includes('.nowignore'), '') || '',
          '.nowignore'
        ),
        ''
      )
    : await maybeRead(join(path, '.nowignore'), '');

  const ig = ignore().add(`${ignores.join('\n')}\n${nowIgnore}`);

  return { ig, ignores };
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

  url = `${opts.apiUrl || 'https://api.zeit.co'}${url}`;
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
  const isDebug = debug || process.env.NOW_CLIENT_DEBUG;

  if (isDebug) {
    return (...logs: string[]) => {
      process.stderr.write(
        [`[now-client-debug] ${new Date().toISOString()}`, ...logs].join(' ') +
          '\n'
      );
    };
  }

  return () => {};
}
