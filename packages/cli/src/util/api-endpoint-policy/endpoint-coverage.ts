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
 * Resolves TypeScript source files that implement a command / subcommand.
 */
export function resolveCommandSourceFiles(
  commandPath: string,
  command: Command,
  cliSrcRoot: string
): string[] {
  const parts = commandPath.split(' ');
  const top = parts[0];
  const commandDir = path.join(cliSrcRoot, 'commands', top);
  const utilDir = path.join(cliSrcRoot, 'util', top);

  if (!fs.existsSync(commandDir)) {
    return [];
  }

  const siblingNames = new Set(
    (command.subcommands ?? []).map(subcommand => subcommand.name)
  );
  const parentSiblingNames = listSiblingSubcommandNames(commandDir, parts);

  let entries: string[];
  if (parts.length === 1) {
    entries = listTsFiles(commandDir);
  } else {
    const leaf = parts[parts.length - 1];
    entries = [
      path.join(commandDir, `${leaf}.ts`),
      path.join(commandDir, leaf, 'index.ts'),
      ...listTsFiles(path.join(commandDir, leaf)),
    ].filter(file => fs.existsSync(file) && fs.statSync(file).isFile());
  }

  if (fs.existsSync(utilDir)) {
    if (parts.length === 1) {
      entries.push(...listTsFiles(utilDir));
    } else {
      const leaf = parts[parts.length - 1];
      entries.push(
        ...[
          path.join(utilDir, `${leaf}.ts`),
          path.join(utilDir, leaf, 'index.ts'),
          ...listTsFiles(path.join(utilDir, leaf)),
        ].filter(file => fs.existsSync(file) && fs.statSync(file).isFile())
      );
    }
  }

  const allowedRoots = [commandDir, utilDir].filter(root =>
    fs.existsSync(root)
  );
  const excludeNames = new Set([...parentSiblingNames, ...siblingNames]);
  if (parts.length > 1) {
    excludeNames.delete(parts[parts.length - 1]);
  }

  return collectWithImports(entries, allowedRoots, commandDir, excludeNames);
}

function listSiblingSubcommandNames(
  commandDir: string,
  parts: string[]
): Set<string> {
  if (parts.length < 2 || !fs.existsSync(commandDir)) {
    return new Set();
  }
  const names = new Set<string>();
  for (const entry of fs.readdirSync(commandDir, { withFileTypes: true })) {
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
