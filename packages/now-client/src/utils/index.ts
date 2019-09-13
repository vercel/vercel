import { DeploymentFile } from './hashes';
import { parse as parseUrl } from 'url';
import fetch_ from 'node-fetch';
import { readFile } from 'fs-extra';
import { join, sep } from 'path';
import qs from 'querystring';
import pkg from '../../package.json';
import { Options } from '../deploy';

export const API_FILES = 'https://api.zeit.co/v2/now/files';
export const API_DEPLOYMENTS = 'https://api.zeit.co/v9/now/deployments';
export const API_DEPLOYMENTS_LEGACY = 'https://api.zeit.co/v3/now/deployments';
export const API_DELETE_DEPLOYMENTS_LEGACY = 'https://api.zeit.co/v2/now/deployments';

export const EVENTS = new Set([
  // File events
  'hashes-calculated',
  'file_count',
  'file-uploaded',
  'all-files-uploaded',
  // Deployment events
  'created',
  'ready',
  'warning',
  'error',
  // Build events
  'build-state-changed',
]);

export function parseNowJSON(file?: DeploymentFile): NowJsonOptions {
  if (!file) {
    return {};
  }

  try {
    const jsonString = file.data.toString();

    return JSON.parse(jsonString);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);

    return {};
  }
}

export async function getNowIgnore(
  files: string[],
  path: string | string[]
): Promise<string[]> {
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
    '.env.build',
    '.venv',
    'npm-debug.log',
    'config.gypi',
    'node_modules',
    '__pycache__/',
    'venv/',
    'CVS',
  ];

  await Promise.all(
    files.map(
      async (file: string): Promise<void> => {
        if (file.includes('.nowignore')) {
          const filePath = Array.isArray(path)
            ? file
            : file.includes(path)
            ? file
            : join(path, file);
          const nowIgnore = await readFile(filePath);

          nowIgnore
            .toString()
            .split('\n')
            .filter((s: string): boolean => s.length > 0)
            .forEach((entry: string): number => ignores.push(entry));
        }
      }
    )
  );

  return ignores;
}

export const fetch = (
  url: string,
  token: string,
  opts: any = {}
): Promise<any> => {
  if (opts.teamId) {
    const parsedUrl = parseUrl(url, true);
    const query = parsedUrl.query;

    query.teamId = opts.teamId;
    url = `${parsedUrl.href}?${qs.encode(query)}`;
    delete opts.teamId;
  }

  opts.headers = opts.headers || {};
  // @ts-ignore
  opts.headers.Authorization = `Bearer ${token}`;
  // @ts-ignore
  opts.headers['user-agent'] = `now-client-v${pkg.version}`;

  return fetch_(url, opts);
};

export interface PreparedFile {
  file: string;
  sha: string;
  size: number;
}

const isWin = process.platform.includes('win');

export const prepareFiles = (
  files: Map<string, DeploymentFile>,
  options: Options
): PreparedFile[] => {
  const preparedFiles = [...files.keys()].reduce(
    (acc: PreparedFile[], sha: string): PreparedFile[] => {
      const next = [...acc];

      const file = files.get(sha) as DeploymentFile;

      for (const name of file.names) {
        let fileName;

        if (options.isDirectory) {
          // Directory
          fileName = options.path
            ? name.substring(options.path.length + 1)
            : name;
        } else {
          // Array of files or single file
          const segments = name.split(sep);
          fileName = segments[segments.length - 1];
        }

        next.push({
          file: isWin ? fileName.replace(/\\/g, '/') : fileName,
          size: file.data.byteLength || file.data.length,
          sha,
        });
      }

      return next;
    },
    []
  );

  return preparedFiles;
};
