import { FilesMap } from './hashes';
import { formatNetworkError } from './network-error';
import { join, sep, relative, basename, isAbsolute } from 'path';
import { Readable } from 'stream';
import { URL } from 'url';
import ignore from 'ignore';
import { pkgVersion } from '../pkg';
import { NowBuildError } from '@vercel/build-utils';
import { FetchDispatcher, VercelClientOptions, VercelConfig } from '../types';
import { Sema } from 'async-sema';
import { pathExists, readFile, stat } from 'fs-extra';
import readdir from './readdir-recursive';

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
  // v1 Checks events
  'checks-registered',
  'checks-completed',
  'checks-running',
  'checks-conclusion-succeeded',
  'checks-conclusion-failed',
  'checks-conclusion-skipped',
  'checks-conclusion-canceled',
  // v2 Checks events
  'checks-v2-failed',
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
    console.error(e);

    return {};
  }
}

const maybeRead = async function <T>(path: string, default_: T) {
  try {
    return await readFile(path, 'utf8');
  } catch (_err) {
    return default_;
  }
};

type UserIgnore = {
  ig: Ignore;
  ignoreFile: string;
  ignoreFileName: '.vercelignore' | '.nowignore';
};

/**
 * Reads the project's `.vercelignore` / `.nowignore` file (if any) and
 * returns an `Ignore` instance containing only the user-provided rules.
 * Returns `null` when no ignore file is present.
 */
async function getUserIgnore(cwd: string): Promise<UserIgnore | null> {
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
  const ignoreFile = vercelignore || nowignore;
  if (!ignoreFile) {
    return null;
  }
  return {
    ig: ignore().add(clearRelative(ignoreFile)),
    ignoreFile,
    ignoreFileName: vercelignore ? '.vercelignore' : '.nowignore',
  };
}

// VCS source-upload defaults cannot be overridden by user negations
// or dependency/output exceptions when collecting prebuilt references.
const VCS_DEFAULTS = ['.hg', '.git', '.gitmodules', '.svn', 'CVS'];
const filePathMapVcsDefaults = ignore().add(VCS_DEFAULTS);

/**
 * Source-upload defaults that `--prebuilt` `filePathMap` may re-add even when
 * the user also listed them in `.vercelignore`. These are dependency / framework
 * output trees the CLI already skips on a normal deploy; NFT traces files inside
 * them that hydrate still needs. Secrets (`.env*`), VCS, and `.vercel` are
 * intentionally not in this list. VCS references are rejected independently
 * by `filePathMapVcsDefaults`; other paths still respect user ignore rules.
 */
const FILEPATHMAP_VERCELIGNORE_EXCEPTIONS = [
  'node_modules',
  '.next',
  '.yarn/cache',
  '.pnp*',
  '.venv',
  'venv',
  '__pycache__',
  '/target',
];

const filePathMapVercelignoreExceptions = ignore().add(
  FILEPATHMAP_VERCELIGNORE_EXCEPTIONS.join('\n')
);

function isFilePathMapIgnoreException(posixRel: string): boolean {
  return filePathMapVercelignoreExceptions.ignores(posixRel);
}

const FILEPATHMAP_IGNORE_WARNING_LIST_LIMIT = 100;

type FilePathMapIgnoreViolation = {
  path: string;
  rule?: string;
  line?: number;
};

/**
 * Replay the ignore file in order and return the rule that transitions the
 * path into its final ignored state. Checking the state after every rule keeps
 * negations and re-ignores consistent with the full `ignore` matcher.
 */
function findMatchingIgnoreRule(
  ignoreFile: string,
  posixRel: string
): Omit<FilePathMapIgnoreViolation, 'path'> {
  const matcher = ignore();
  let wasIgnored = false;
  let match: Omit<FilePathMapIgnoreViolation, 'path'> = {};

  for (const [index, rule] of ignoreFile.split(/\r?\n/).entries()) {
    matcher.add(clearRelative(rule));
    const isIgnored = matcher.ignores(posixRel);
    if (!wasIgnored && isIgnored) {
      match = { rule, line: index + 1 };
    } else if (wasIgnored && !isIgnored) {
      match = {};
    }
    wasIgnored = isIgnored;
  }

  return match;
}

function formatFilePathMapIgnoreWarning(
  entries: FilePathMapIgnoreViolation[],
  ignoreFileName: string,
  truncated = false
): string {
  const shown = entries.slice(0, FILEPATHMAP_IGNORE_WARNING_LIST_LIMIT);
  const lines = shown.map(({ path, rule, line }) =>
    rule && line
      ? `  ${path} (matched \`${ignoreFileName}:${line}\`: \`${rule}\`)`
      : `  ${path}`
  );
  if (truncated) {
    lines.push('  …and more');
  }
  const count = truncated ? `at least ${shown.length}` : String(entries.length);
  const fileWord = !truncated && entries.length === 1 ? 'file' : 'files';
  const ignoreFileLabel =
    ignoreFileName === '.nowignore'
      ? `\`${ignoreFileName}\` (deprecated)`
      : `\`${ignoreFileName}\``;
  return [
    `${ignoreFileLabel} excludes ${count} ${fileWord} the prebuilt functions need. Uploading without them may fail with ENOENT.`,
    '',
    ...lines,
    '',
    `Remove the colliding rules from \`${ignoreFileName}\`, or exclude those paths from tracing with \`outputFileTracingExcludes\`.`,
  ].join('\n');
}

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
): Promise<{ fileList: string[]; ignoreList: string[]; warning?: string }> {
  const ignoreList: string[] = [];
  let fileList: string[];
  let warning: string | undefined;
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
      // `filePathMap` values come from the `.vercel/output` build artifact,
      // which in split build/deploy workflows may be produced by a
      // lower-trust job than the one running the deploy. Re-apply the
      // project's `.vercelignore` / `.nowignore` rules and reject values
      // that escape the deployment root, so a tampered artifact cannot
      // re-add ignored files (e.g. `.env`) to the upload set.
      //
      // Exception: paths under source-upload defaults like `node_modules/`
      // and `.next/` — users often copy those into `.vercelignore`, but
      // they are already ignored on a normal deploy, and `--prebuilt`
      // must still upload the NFT-traced subset.
      //
      // Other ignored `filePathMap` entries are dropped, leaving dangling
      // references in `.vc-config.json` that can crash remotely with ENOENT.
      // Warn with a bounded list of colliding paths so the user can fix them.
      // See https://github.com/vercel/vercel/issues/17386.
      const userIg = await getUserIgnore(path);
      const ignoredFilePathMap = new Map<
        string,
        Omit<FilePathMapIgnoreViolation, 'path'>
      >();
      let ignoredFilePathMapTruncated = false;
      const vcConfigs = await Promise.all(
        vcConfigFilePaths.map(async p => {
          const configJson = await readFile(p, 'utf8');
          return JSON.parse(configJson);
        })
      );
      for (const config of vcConfigs) {
        if (!config.filePathMap) continue;
        for (const v of Object.values(config.filePathMap) as string[]) {
          const absPath = join(path, v);
          const rel = relative(path, absPath);
          const posixRel = rel.split(sep).join('/');
          if (rel.startsWith('..') || isAbsolute(rel)) {
            debug(
              `Ignoring "filePathMap" entry "${v}": resolves outside the deployment root`
            );
            continue;
          }
          if (filePathMapVcsDefaults.ignores(posixRel)) {
            // Reject before hashing or archiving, rather than leave dangling
            // references that fail during remote hydration. Do not echo
            // artifact-controlled paths or file contents in the error.
            throw new NowBuildError({
              code: 'PREBUILT_FILEPATHMAP_VCS',
              message:
                'Prebuilt functions reference version-control files that cannot be uploaded. Exclude version-control files from tracing and rebuild the prebuilt output.',
            });
          }
          if (userIg && userIg.ig.ignores(posixRel)) {
            if (isFilePathMapIgnoreException(posixRel)) {
              debug(
                `Keeping "filePathMap" entry "${v}": matches a default-ignored dependency/output path`
              );
            } else if (ignoredFilePathMap.has(posixRel)) {
              continue;
            } else if (fileList.includes(absPath)) {
              debug(
                `Skipping "filePathMap" entry "${v}": already in the upload set`
              );
              continue;
            } else if (
              ignoredFilePathMap.size >= FILEPATHMAP_IGNORE_WARNING_LIST_LIMIT
            ) {
              // Cap the warning list; keep scanning so later non-ignored
              // entries are still added to the upload set.
              ignoredFilePathMapTruncated = true;
              continue;
            } else {
              ignoredFilePathMap.set(
                posixRel,
                findMatchingIgnoreRule(userIg.ignoreFile, posixRel)
              );
              continue;
            }
          }
          refs.add(absPath);
        }
      }
      if (ignoredFilePathMap.size > 0) {
        const violations = [...ignoredFilePathMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([ignoredPath, match]) => ({ path: ignoredPath, ...match }));
        warning = formatFilePathMapIgnoreWarning(
          violations,
          userIg?.ignoreFileName || '.vercelignore',
          ignoredFilePathMapTruncated
        );
      }

      try {
        const {
          findConfig: findMicrofrontendsConfig,
          inferMicrofrontendsLocation,
        } = await import('@vercel/microfrontends/microfrontends/utils');
        // 2.x: pass undefined so we still only look for microfrontends.json{,c}.
        const customConfigFilename = undefined;
        let microfrontendConfigPath = findMicrofrontendsConfig({
          dir: join(path, rootDirectory || ''),
          customConfigFilename,
        });
        if (!microfrontendConfigPath && !rootDirectory && projectName) {
          microfrontendConfigPath = findMicrofrontendsConfig({
            dir: inferMicrofrontendsLocation({
              repositoryRoot: path,
              applicationContext: { name: projectName },
              customConfigFilename,
            }),
            customConfigFilename,
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

    // Include bulkRedirectsPath file or directory if specified (for prebuilt deployments)
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
            `Skipping bulk redirects path "${bulkRedirectsPath}" - path traversal detected (resolves outside project root)`
          );
        } else {
          try {
            const stats = await stat(bulkRedirectsFullPath);
            if (stats.isDirectory()) {
              // If it's a directory, recursively include all files
              const dirFiles = await readdir(bulkRedirectsFullPath, []);
              for (const file of dirFiles) {
                refs.add(file);
              }
              debug(
                `Including ${dirFiles.length} files from bulk redirects directory "${bulkRedirectsPath}" in deployment`
              );
            } else if (stats.isFile()) {
              // If it's a file, include it directly
              refs.add(bulkRedirectsFullPath);
              debug(
                `Including bulk redirects file "${bulkRedirectsPath}" in deployment`
              );
            }
          } catch (_e) {
            debug(`Bulk redirects path "${bulkRedirectsPath}" not found`);
          }
        }
      } catch (e) {
        debug(`Error checking for bulk redirects path: ${e}`);
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

  return { fileList, ignoreList, warning };
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
    // Root-anchor negations: ignore@4 caches regexes by pattern string without
    // the negation flag, so an unanchored `!.vercel` collides with a positive
    // `.vercel` compiled earlier and re-includes files meant to stay local.
    ignores = ['*'];
    const parts = relOutputDir.split(sep);
    parts.forEach((_, i) => {
      const level = parts.slice(0, i + 1).join('/');
      ignores.push(`!/${level}`);
    });
    ignores.push(`!/${parts.join('/')}/**`);
    ig.add(ignores.join('\n'));
  } else {
    ignores = [
      ...VCS_DEFAULTS,
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

    const isRustProject = (
      await Promise.all(cwds.map(cwd => pathExists(join(cwd, 'Cargo.toml'))))
    ).some(Boolean);

    if (isRustProject) {
      ignores.push('/target');
    }

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

type NativeRequestInit = NonNullable<Parameters<typeof globalThis.fetch>[1]>;

interface FetchOpts
  extends Omit<NativeRequestInit, 'body' | 'headers' | 'dispatcher'> {
  apiUrl?: string;
  method?: string;
  teamId?: string;
  headers?: { [key: string]: any };
  userAgent?: string;
  body?: NonNullable<NativeRequestInit['body']> | Buffer | Readable;
  dispatcher?: FetchDispatcher;
}

export const fetchApi = async (
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

  if (opts.body instanceof Readable) {
    // Node.js streams must be sent with half duplex, since the request
    // body length is not known upfront.
    (opts as { duplex?: 'half' }).duplex = 'half';
  }

  const parsedUrl = new URL(url);
  const request = `${opts.method || 'GET'} ${parsedUrl.origin}${parsedUrl.pathname}`;
  debug(request);
  time = Date.now();
  try {
    const res = await fetch(url, opts as unknown as NativeRequestInit);
    const requestId = res.headers.get('x-vercel-id');
    const id =
      requestId && /^[a-zA-Z0-9:_.-]{1,200}$/.test(requestId)
        ? ` requestId=${requestId}`
        : '';
    debug(
      `DONE in ${Date.now() - time}ms: ${request} status=${res.status}${id}`
    );
    return res;
  } catch (error) {
    debug(
      `FAILED in ${Date.now() - time}ms: ${request} ${formatNetworkError(error)}`
    );
    throw error;
  } finally {
    semaphore.release();
  }
};

export interface PreparedFile {
  file: string;
  sha?: string;
  size?: number;
  mode: number;
  data?: string;
  encoding?: 'base64';
}

const isWin = process.platform.includes('win');

const INLINE_STATIC_EXTENSIONS = ['.html', '.htm', '.md'];
const MAX_INLINE_FILES = 10;
const MAX_INLINE_TOTAL_BYTES = 5 * 1024 * 1024; // 5MB
const S_IFREG = 0o100000;
const S_IFMT = 0o170000;

/**
 * Small all-static file sets are sent inline in the deployment creation
 * request instead of as SHA references. This lets the API take its instant
 * static fast path (deployment is READY in the create response, no build) —
 * eligibility is decided entirely server-side, and ineligible deployments
 * fall back to the regular build flow with no behavior change.
 */
export function shouldInlineStaticFiles(files: FilesMap): boolean {
  let count = 0;
  let totalBytes = 0;
  for (const file of files.values()) {
    if ((file.mode & S_IFMT) !== S_IFREG) return false;
    // Large files are streamed from disk and have no in-memory data
    if (!file.data) return false;
    for (const name of file.names) {
      const lower = name.toLowerCase();
      if (!INLINE_STATIC_EXTENSIONS.some(ext => lower.endsWith(ext))) {
        return false;
      }
      count += 1;
      totalBytes += file.data.byteLength;
    }
  }
  return (
    count > 0 &&
    count <= MAX_INLINE_FILES &&
    totalBytes <= MAX_INLINE_TOTAL_BYTES
  );
}

export const prepareFiles = (
  files: FilesMap,
  clientOptions: VercelClientOptions
): PreparedFile[] => {
  const preparedFiles: PreparedFile[] = [];
  const inlineStaticFiles = shouldInlineStaticFiles(files);
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

      const normalizedName = isWin ? fileName.replace(/\\/g, '/') : fileName;

      if (inlineStaticFiles && file.data) {
        // The InlinedFile API schema rejects `sha` and `size`
        preparedFiles.push({
          file: normalizedName,
          data: file.data.toString('base64'),
          encoding: 'base64',
          mode: file.mode,
        });
        continue;
      }

      preparedFiles.push({
        file: normalizedName,
        size: file.data?.byteLength ?? file.size,
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
export type Debug = ReturnType<typeof createDebug>;
