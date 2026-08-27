import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command, CommandEndpoint } from '../../commands/help';
import {
  collectRelativeImports,
  extractFetchesFromFile,
  toCommandEndpoint,
  type ExtractedFetch,
} from './extract-fetches';
import {
  formatEndpoint,
  normalizeEndpoint,
  type PolicyViolation,
} from './policy';

const DEFAULT_CLI_SRC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../'
);

export interface CoverageOptions {
  /** Absolute path to `packages/cli/src`. */
  readonly cliSrcRoot?: string;
}

/**
 * For commands that declare `endpoints`, statically extract `client.fetch`
 * call sites from the command's implementation files and fail when any
 * resolvable call is missing from the declaration.
 *
 * Scope is intentionally limited to `commands/<top>/` and `util/<top>/`
 * (plus relative imports within those trees) so shared helpers outside the
 * command's area are not falsely attributed. Dynamic / unresolvable paths
 * are skipped — they must still be declared manually.
 */
export function evaluateEndpointCoverage(
  commands: ReadonlyArray<Command>,
  options: CoverageOptions = {}
): PolicyViolation[] {
  const cliSrcRoot = options.cliSrcRoot ?? DEFAULT_CLI_SRC_ROOT;
  const violations: PolicyViolation[] = [];

  for (const { path: commandPath, command } of flattenForCoverage(commands)) {
    if (!command.endpoints || command.endpoints.length === 0) {
      continue;
    }

    const files = resolveCommandSourceFiles(commandPath, command, cliSrcRoot);
    if (files.length === 0) {
      continue;
    }

    const extracted = files.flatMap(file => extractFetchesFromFile(file));
    if (extracted.length === 0) {
      continue;
    }

    const declared = new Set(
      command.endpoints.map(endpoint => normalizeEndpoint(endpoint))
    );
    const missing = uniqueMissing(extracted, declared);

    if (missing.length > 0) {
      const details = missing
        .map(fetch => {
          const endpoint = formatEndpoint(toCommandEndpoint(fetch));
          const location = `${path.relative(cliSrcRoot, fetch.file)}:${fetch.line}`;
          return `${endpoint} (${location})`;
        })
        .join(', ');
      violations.push({
        commandPath,
        message:
          `"${commandPath}" calls API endpoints that are not listed in ` +
          `its \`endpoints\` declaration (${details}). Add them to the ` +
          'declaration (and mark `beta: true` if any are private). See ' +
          'packages/cli/docs/api-endpoint-policy.md',
      });
    }
  }

  return violations;
}

function flattenForCoverage(
  commands: ReadonlyArray<Command>,
  parentPath = ''
): Array<{ path: string; command: Command }> {
  const out: Array<{ path: string; command: Command }> = [];
  for (const command of commands) {
    const commandPath = parentPath
      ? `${parentPath} ${command.name}`
      : command.name;
    out.push({ path: commandPath, command });
    if (command.subcommands) {
      out.push(...flattenForCoverage(command.subcommands, commandPath));
    }
  }
  return out;
}

function uniqueMissing(
  extracted: ReadonlyArray<ExtractedFetch>,
  declared: ReadonlySet<string>
): ExtractedFetch[] {
  const seen = new Set<string>();
  const missing: ExtractedFetch[] = [];
  for (const fetch of extracted) {
    const key = normalizeEndpoint(toCommandEndpoint(fetch));
    if (declared.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    missing.push(fetch);
  }
  return missing;
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
  // When checking a subcommand, siblings are the parent's other subcommands —
  // we only know the leaf's own subcommands here. Re-derive siblings from the
  // parent directory's known command files instead when needed.
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

/** @internal exported for tests */
export function coverageGap(
  declared: ReadonlyArray<CommandEndpoint>,
  extracted: ReadonlyArray<ExtractedFetch>
): ExtractedFetch[] {
  const declaredKeys = new Set(
    declared.map(endpoint => normalizeEndpoint(endpoint))
  );
  return uniqueMissing(extracted, declaredKeys);
}
