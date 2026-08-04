import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from '../../commands/help';
import {
  collectRelativeImports,
  extractFetchesFromFile,
  type ExtractedFetch,
} from './extract-fetches';

const DEFAULT_CLI_SRC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../'
);

/**
 * Display command name → on-disk directory under `commands/` / `util/`.
 * (`vc connect` lives in `commands/connex/`.)
 */
const COMMAND_DIR_ALIASES: Readonly<Record<string, string>> = {
  connect: 'connex',
};

/**
 * Per top-level command: leaf CLI name → alternate source basenames
 * (without `.ts`) when the filename does not match the subcommand name.
 */
const LEAF_FILE_ALIASES: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = {
  blob: {
    'create-store': ['store-add'],
    'delete-store': ['store-remove'],
    'empty-store': ['store-empty'],
    'get-store': ['store-get'],
    'list-stores': ['store-list'],
  },
  'deploy-hooks': {
    list: ['ls'],
    remove: ['rm'],
  },
  project: {
    remove: ['rm'],
  },
  integration: {
    open: ['open-integration'],
    remove: ['remove-integration'],
    update: ['update-integration'],
  },
  'integration-resource': {
    remove: ['remove-resource'],
  },
  alerts: {
    inspect: ['rule-inspect'],
  },
};

export interface CoverageOptions {
  /** Absolute path to `packages/cli/src`. */
  readonly cliSrcRoot?: string;
}

export type ExtractCommandFetches = (
  commandPath: string,
  command: Command
) => ExtractedFetch[];

/**
 * Statically extract resolvable `client.fetch` call sites from a command's
 * implementation files under `commands/<top>/` and `util/<top>/`.
 *
 * Dynamic / unresolvable paths are skipped. Shared helpers outside those
 * trees are out of scope.
 */
export function extractCommandFetches(
  commandPath: string,
  command: Command,
  options: CoverageOptions = {}
): ExtractedFetch[] {
  const cliSrcRoot = options.cliSrcRoot ?? DEFAULT_CLI_SRC_ROOT;
  const files = resolveCommandSourceFiles(commandPath, command, cliSrcRoot);
  return files.flatMap(file => extractFetchesFromFile(file));
}

/**
 * Maps a flattened command path to its on-disk top-level directory and the
 * remaining path segments under that directory.
 */
export function resolveCommandFilesystemPath(commandPath: string): {
  readonly topDir: string;
  readonly segments: readonly string[];
} {
  const parts = commandPath.split(' ').filter(Boolean);
  let top = parts[0] ?? '';
  let segments = parts.slice(1);

  // Nested `integration resource …` is implemented under
  // `commands/integration-resource/`, not `commands/integration/resource/`.
  if (top === 'integration' && segments[0] === 'resource') {
    top = 'integration-resource';
    segments = segments.slice(1);
  }

  top = COMMAND_DIR_ALIASES[top] ?? top;
  return { topDir: top, segments };
}

/**
 * Resolves TypeScript source files that implement a command / subcommand.
 */
export function resolveCommandSourceFiles(
  commandPath: string,
  command: Command,
  cliSrcRoot: string
): string[] {
  const { topDir, segments } = resolveCommandFilesystemPath(commandPath);
  const commandDir = path.join(cliSrcRoot, 'commands', topDir);
  const utilDir = path.join(cliSrcRoot, 'util', topDir);

  if (!fs.existsSync(commandDir)) {
    return [];
  }

  const siblingNames = new Set(
    (command.subcommands ?? []).map(subcommand => subcommand.name)
  );
  const parentSiblingNames = listSiblingSubcommandNames(commandDir, segments);

  let entries: string[];
  if (segments.length === 0) {
    entries = listTsFiles(commandDir);
  } else {
    entries = resolveLeafEntries(commandDir, topDir, segments);
  }

  if (fs.existsSync(utilDir)) {
    if (segments.length === 0) {
      entries.push(...listTsFiles(utilDir));
    } else {
      entries.push(...resolveLeafEntries(utilDir, topDir, segments));
    }
  }

  const allowedRoots = [commandDir, utilDir].filter(root =>
    fs.existsSync(root)
  );
  const excludeNames = new Set([...parentSiblingNames, ...siblingNames]);
  if (segments.length > 0) {
    const leaf = segments[segments.length - 1];
    excludeNames.delete(leaf);
    for (const alias of LEAF_FILE_ALIASES[topDir]?.[leaf] ?? []) {
      excludeNames.delete(alias);
    }
  }

  return collectWithImports(entries, allowedRoots, commandDir, excludeNames);
}

function resolveLeafEntries(
  rootDir: string,
  topDir: string,
  segments: readonly string[]
): string[] {
  const leaf = segments[segments.length - 1];
  const nestedDir = path.join(rootDir, ...segments.slice(0, -1));
  const leafAliases = LEAF_FILE_ALIASES[topDir]?.[leaf] ?? [];
  const basenames = [leaf, ...leafAliases];

  const candidates: string[] = [];
  for (const base of basenames) {
    candidates.push(
      path.join(nestedDir, `${base}.ts`),
      path.join(nestedDir, base, 'index.ts'),
      ...listTsFiles(path.join(nestedDir, base))
    );
    // Also try leaf at the command root (legacy flat layout).
    if (segments.length > 1) {
      candidates.push(
        path.join(rootDir, `${base}.ts`),
        path.join(rootDir, base, 'index.ts')
      );
    }
  }

  return candidates.filter(
    file => fs.existsSync(file) && fs.statSync(file).isFile()
  );
}

function listSiblingSubcommandNames(
  commandDir: string,
  segments: readonly string[]
): Set<string> {
  if (segments.length === 0 || !fs.existsSync(commandDir)) {
    return new Set();
  }
  // Siblings live next to the leaf: under the nested parent dir when the
  // command path has intermediate segments (e.g. `alerts rules inspect`).
  const siblingDir =
    segments.length === 1
      ? commandDir
      : path.join(commandDir, ...segments.slice(0, -1));
  if (!fs.existsSync(siblingDir)) {
    return new Set();
  }
  const names = new Set<string>();
  for (const entry of fs.readdirSync(siblingDir, { withFileTypes: true })) {
    if (entry.name === 'command.ts' || entry.name === 'index.ts') {
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      names.add(entry.name.replace(/\.ts$/, ''));
    } else if (entry.isDirectory()) {
      names.add(entry.name);
    }
  }
  return names;
}

function listTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

function collectWithImports(
  entries: ReadonlyArray<string>,
  allowedRoots: ReadonlyArray<string>,
  commandDir: string,
  excludeSiblingNames: ReadonlySet<string>
): string[] {
  const files = new Set<string>();
  const queue = [...entries];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || files.has(file)) {
      continue;
    }
    if (!isUnderAny(file, allowedRoots)) {
      continue;
    }
    if (isExcludedSiblingEntry(file, commandDir, excludeSiblingNames)) {
      continue;
    }
    files.add(file);

    let sourceText: string;
    try {
      sourceText = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const specifier of collectRelativeImports(file, sourceText)) {
      const resolved = resolveImportToFileLocal(file, specifier);
      if (resolved && !files.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return [...files];
}

function isUnderAny(file: string, roots: ReadonlyArray<string>): boolean {
  const resolved = path.resolve(file);
  return roots.some(root => {
    const relative = path.relative(path.resolve(root), resolved);
    return (
      relative === '' ||
      (!relative.startsWith('..') && !path.isAbsolute(relative))
    );
  });
}

function isExcludedSiblingEntry(
  file: string,
  commandDir: string,
  excludeSiblingNames: ReadonlySet<string>
): boolean {
  if (excludeSiblingNames.size === 0) {
    return false;
  }
  const relative = path.relative(commandDir, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }
  const [first] = relative.split(path.sep);
  if (!first) {
    return false;
  }
  const base = first.replace(/\.ts$/, '');
  return excludeSiblingNames.has(base);
}

function resolveImportToFileLocal(
  fromFile: string,
  specifier: string
): string | null {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}
