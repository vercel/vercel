import { normalizePath } from '@vercel/build-utils';
import { frameworkList } from '@vercel/frameworks';
import { lstat } from 'fs-extra';
import { readdir } from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import type Client from '../client';
import { isIgnoredDirectory } from '../projects/ignored-directories';
import {
  frameworkLabel,
  MAX_SCAN_DEPTH,
  type PendingRepoFrameworks,
  type RepoFrameworks,
} from '../projects/detect-repo-frameworks';

/** Sentinel for "the current directory", which maps back to `null`. */
const ROOT_VALUE = '';

const ROOT_DISPLAY = './';

const PAGE_SIZE = 12;

// The label lives in `name` so it shows on every row, not just the highlighted
// one. Tab writes `name` into the readline buffer, so it has to be stripped
// back off on the way in.
function withFrameworkLabel(name: string, label: string | undefined): string {
  return label ? `${name} (${label})` : name;
}

function stripFrameworkLabel(term: string): string {
  const match = term.match(/^(.*?)\s+\(([^)]+)\)\s*$/);
  if (!match) return term;
  // Only strip real framework names, so `app (old)` stays searchable as typed.
  return KNOWN_FRAMEWORK_NAMES.has(match[2]) ? match[1] : term;
}

const KNOWN_FRAMEWORK_NAMES = new Set(frameworkList.map(f => f.name));

/**
 * A trailing `/` on `name` is what makes Tab descend: completing to `apps/`
 * re-runs the source with that term.
 */
interface RootDirectoryChoice {
  name: string;
  value: string;
  short: string;
  description?: string;
}

/** Split a typed term into the directory to list and a prefix to filter by. */
function parseTerm(term: string): { parent: string; prefix: string } {
  const normalized = term.replace(/\\/g, '/');

  if (normalized.endsWith('/')) {
    return { parent: normalized.replace(/\/+$/, ''), prefix: '' };
  }

  const parent = path.posix.dirname(normalized);
  return {
    parent: parent === '.' ? '' : parent,
    prefix: path.posix.basename(normalized),
  };
}

function hasAncestorIn(dir: string, set: Set<string>): boolean {
  let index = dir.indexOf('/');
  while (index !== -1) {
    if (set.has(dir.slice(0, index))) return true;
    index = dir.indexOf('/', index + 1);
  }
  return false;
}

function isInsideCwd(cwd: string, relative: string): boolean {
  const base = path.resolve(cwd);
  const target = path.resolve(path.join(cwd, relative));
  return target === base || target.startsWith(base + path.sep);
}

// The source re-runs on every keystroke over mostly the same directories.
let listingCache = new Map<string, Promise<string[]>>();

function readSubdirectories(
  cwd: string,
  relativeDir: string
): Promise<string[]> {
  // Cache the promise, not the result, so concurrent callers share one read.
  const cached = listingCache.get(relativeDir);
  if (cached) {
    return cached;
  }

  const pending = listSubdirectories(cwd, relativeDir);
  listingCache.set(relativeDir, pending);
  return pending;
}

async function listSubdirectories(
  cwd: string,
  relativeDir: string
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(path.join(cwd, relativeDir), {
      withFileTypes: true,
    });
  } catch {
    return [];
  }

  return entries
    .filter(entry => entry.isDirectory())
    .filter(entry => !isIgnoredDirectory(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

const SEARCH_MAX_DIRECTORIES = 750;
const SEARCH_MAX_RESULTS = 40;

/**
 * Find directories whose name contains `term`, so `cli` matches
 * `packages/cli`. Breadth-first, so shallower matches win the budget.
 *
 * Depth-capped for cost, not correctness: a path typed past the cap is still
 * listed by `browseDirectories()` and still selectable.
 */
async function searchNestedDirectories(
  cwd: string,
  term: string
): Promise<string[]> {
  const needle = term.toLowerCase();
  const matches: string[] = [];
  let scanned = 0;

  let level: string[] = [''];

  for (let depth = 0; depth < MAX_SCAN_DEPTH; depth++) {
    if (level.length === 0) break;
    if (matches.length >= SEARCH_MAX_RESULTS) break;
    if (scanned >= SEARCH_MAX_DIRECTORIES) break;

    const nextLevel: string[] = [];

    // Sequential per level, so the budget is not overshot in parallel.
    for (const dir of level) {
      if (scanned >= SEARCH_MAX_DIRECTORIES) break;
      scanned++;

      const names = await readSubdirectories(cwd, dir);
      for (const name of names) {
        const relative = dir ? `${dir}/${name}` : name;
        if (name.toLowerCase().includes(needle)) {
          matches.push(relative);
        }
        nextLevel.push(relative);
      }
    }

    level = nextLevel;
  }

  return matches.slice(0, SEARCH_MAX_RESULTS);
}

async function browseDirectories(
  cwd: string,
  term: string,
  frameworks?: RepoFrameworks
): Promise<RootDirectoryChoice[]> {
  const searchTerm = stripFrameworkLabel(term).trim();

  // `./` and `.` count as empty so Tab on the root entry re-renders this list
  // instead of descending into a level named ".".
  if (!searchTerm || searchTerm === ROOT_DISPLAY || searchTerm === '.') {
    const names = await readSubdirectories(cwd, '');
    const children = await toChoices(cwd, '', names, frameworks);
    return [
      {
        name: withFrameworkLabel(
          ROOT_DISPLAY,
          frameworks && frameworkLabel(frameworks, '')
        ),
        value: ROOT_VALUE,
        short: ROOT_DISPLAY,
        description: 'Use this directory, with no Root Directory setting',
      },
      ...children,
    ];
  }

  const { parent, prefix } = parseTerm(searchTerm);

  if (!isInsideCwd(cwd, parent)) {
    return [];
  }

  const names = (await readSubdirectories(cwd, parent)).filter(name =>
    name.toLowerCase().startsWith(prefix.toLowerCase())
  );

  const children = await toChoices(cwd, parent, names, frameworks);

  // When the term names an existing directory (`apps/`), offer it as a
  // selectable answer above its children. The trailing slash keeps Tab a no-op
  // instead of jumping back to the parent level.
  if (!prefix && parent) {
    return [
      {
        name: withFrameworkLabel(
          `${parent}/`,
          frameworks && frameworkLabel(frameworks, parent)
        ),
        value: parent,
        short: parent,
        description: 'Use this directory',
      },
      ...children,
    ];
  }

  // A bare term is a name search as well as a prefix filter. Path-shaped terms
  // stay level-based, since there the user has committed to a location.
  if (!parent) {
    const nested = await searchNestedDirectories(cwd, prefix);

    // Drop matches reachable from something already listed: `app` matches
    // `apps/` and every `apps/*/app` under it. Matches arrive shallowest-first,
    // so growing the set as we go collapses deeper matches under nearer ones.
    const shown = new Set(children.map(choice => choice.value));
    const deeper: string[] = [];
    for (const dir of nested) {
      if (shown.has(dir) || hasAncestorIn(dir, shown)) continue;
      shown.add(dir);
      deeper.push(dir);
    }

    // Shallow prefix matches first, since those are what Tab acts on.
    return [...children, ...(await toChoices(cwd, '', deeper, frameworks))];
  }

  return children;
}

async function toChoices(
  cwd: string,
  parent: string,
  names: string[],
  frameworks?: RepoFrameworks
): Promise<RootDirectoryChoice[]> {
  return Promise.all(
    names.map(async name => {
      const relative = parent ? `${parent}/${name}` : name;
      const grandchildren = await readSubdirectories(cwd, relative);
      const hasChildren = grandchildren.length > 0;
      // Trailing slash signals "Tab here to go deeper".
      const displayPath = hasChildren ? `${relative}/` : relative;
      const label = frameworks && frameworkLabel(frameworks, relative);
      return {
        name: withFrameworkLabel(displayPath, label),
        value: relative,
        short: relative,
      };
    })
  );
}

/**
 * Local pre-check only. `validateRootDirectory()` stays the authority after the
 * prompt closes; it prints through the output manager, which would corrupt the
 * prompt's rendering from in here.
 */
async function validateChoice(
  cwd: string,
  value: string
): Promise<true | string> {
  if (value === ROOT_VALUE) {
    return true;
  }

  const normal = path.normalize(value);

  if (!isInsideCwd(cwd, normal)) {
    return 'That path is outside of the project.';
  }

  const stat = await lstat(path.join(cwd, normal)).catch(() => null);
  if (!stat) {
    return 'That directory does not exist.';
  }
  if (!stat.isDirectory()) {
    return 'That path is a file, but a directory is expected.';
  }

  return true;
}

export async function inputRootDirectory(
  client: Client,
  cwd: string,
  autoConfirm = false,
  pendingFrameworks?: PendingRepoFrameworks
): Promise<string | null> {
  if (autoConfirm) {
    return null;
  }

  listingCache = new Map();

  // Only results that have already arrived; never block the prompt. Read per
  // keystroke so labels appear once the scan lands.
  const readyFrameworks = () => pendingFrameworks?.result();

  const selected = await client.input.search<string>({
    message: `Code directory? ${chalk.dim('(tab to enter a folder)')}`,
    pageSize: PAGE_SIZE,
    source: async term => {
      const choices = await browseDirectories(
        cwd,
        term ?? '',
        readyFrameworks()
      );

      const searchTerm = stripFrameworkLabel(term ?? '').trim();
      if (!searchTerm) {
        return choices;
      }

      // Nothing on disk matches: let the term stand on its own so the error
      // comes from validation rather than an empty list.
      if (choices.length === 0) {
        return [{ name: searchTerm, value: searchTerm, short: searchTerm }];
      }

      return choices;
    },
    validate: value => validateChoice(cwd, value),
  });

  if (selected === ROOT_VALUE) {
    return null;
  }

  const normal = path.normalize(selected);
  if (normal === '.' || normal === './') {
    return null;
  }

  return normalizePath(normal);
}
