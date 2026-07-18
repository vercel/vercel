import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cliArgCommon, cliCommandsDir, cliCommandsIndex } from './paths.js';
import type {
  GeneratedArgument,
  GeneratedCommand,
  GeneratedManifest,
  GeneratedOption,
  OptionTypeJson,
} from './types.js';

/** Minimal shape of CLI `Command` metadata used by the skill generator. */
export interface CliCommand {
  name: string;
  aliases?: ReadonlyArray<string>;
  description?: string;
  default?: true;
  hidden?: true;
  arguments?: ReadonlyArray<{
    name: string;
    required: boolean;
    multiple?: true;
  }>;
  options?: ReadonlyArray<{
    name: string;
    shorthand: string | null;
    type: unknown;
    argument?: string;
    deprecated: boolean;
    description?: string;
  }>;
  examples?: ReadonlyArray<{
    name: string;
    value: string | ReadonlyArray<string>;
  }>;
  disabledGlobalOptions?: ReadonlyArray<string>;
  subcommands?: ReadonlyArray<CliCommand>;
}

function serializeOptionType(type: unknown): OptionTypeJson {
  if (Array.isArray(type)) {
    return type.map(entry => serializeOptionType(entry) as string);
  }
  if (type === String) return 'string';
  if (type === Boolean) return 'boolean';
  if (type === Number) return 'number';
  throw new Error(`Unsupported option type: ${String(type)}`);
}

function normalizeOption(
  option: NonNullable<CliCommand['options']>[number]
): GeneratedOption {
  return {
    name: option.name,
    shorthand: option.shorthand,
    argument: option.argument ?? null,
    type: serializeOptionType(option.type),
    description: option.description ?? '',
    deprecated: Boolean(option.deprecated),
    undocumented: option.description === undefined,
  };
}

function normalizeArgument(
  argument: NonNullable<CliCommand['arguments']>[number]
): GeneratedArgument {
  return {
    name: argument.name,
    required: Boolean(argument.required),
    multiple: Boolean(argument.multiple),
  };
}

function stripJsComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const PUSH_RE = /commandsStructs\.push\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g;

/**
 * Parse `packages/cli/src/commands/index.ts` for root command binding names
 * that are registered without feature flags. Keeps the skill in sync with CLI
 * registration without modifying (or executing) CLI source.
 *
 * The parser fails loud on anything it does not recognize — a silently
 * dropped command would otherwise survive CI, because check.ts regenerates
 * with this same parser.
 */
export function parseRootCommandBindings(indexSource: string): string[] {
  const source = stripJsComments(indexSource);
  const importMap = parseCommandImportMap(indexSource);

  const arrayMatch = source.match(/const commandsStructs = \[([\s\S]*?)\];/);
  if (!arrayMatch) {
    throw new Error(
      'Could not locate commandsStructs array in commands/index.ts'
    );
  }

  const bindings: string[] = [];
  const identRe = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
  for (const match of arrayMatch[1].matchAll(identRe)) {
    const name = match[1];
    if (importMap.has(name)) {
      bindings.push(name);
    } else if (/Command$/.test(name)) {
      throw new Error(
        `Unrecognized command binding "${name}" in commandsStructs — its import was not parsed; update parseCommandImportMap`
      );
    }
  }

  // Pushes gated behind feature flags are excluded: we clear those env vars
  // for deterministic output, so the runtime registry excludes them too.
  const gated = new Set<string>();
  const ffBlockRe = /if\s*\(\s*process\.env\.[A-Z0-9_]+\s*\)\s*\{([\s\S]*?)\}/g;
  for (const block of source.matchAll(ffBlockRe)) {
    for (const match of block[1].matchAll(PUSH_RE)) {
      gated.add(match[1]);
    }
  }

  // Unconditional pushes after the array literal (metrics, connex, …).
  for (const match of source.matchAll(PUSH_RE)) {
    const name = match[1];
    if (gated.has(name) || bindings.includes(name)) {
      continue;
    }
    if (!importMap.has(name)) {
      throw new Error(
        `Unrecognized command binding "${name}" pushed to commandsStructs — its import was not parsed; update parseCommandImportMap`
      );
    }
    bindings.push(name);
  }

  return bindings;
}

export function parseCommandImportMap(
  indexSource: string
): Map<string, string> {
  const map = new Map<string, string>();
  const importRe = /import\s+\{([^}]+)\}\s+from\s+'(\.\/[^']+\/command)';/g;
  for (const match of stripJsComments(indexSource).matchAll(importRe)) {
    for (const rawSpec of match[1].split(',')) {
      const spec = rawSpec.trim();
      if (!spec || spec.startsWith('type ')) continue;
      if (/\bas\b/.test(spec)) {
        throw new Error(
          `Unsupported renamed import "${spec}" in commands/index.ts — update the skill generator to handle it`
        );
      }
      map.set(spec, match[2]);
    }
  }
  return map;
}

function walkCommand(
  command: CliCommand,
  parentPath: string[],
  out: GeneratedCommand[]
): void {
  if (!command.name) {
    throw new Error('Command metadata is missing a name');
  }

  const path = [...parentPath, command.name];
  const subcommands = command.subcommands ?? [];

  out.push({
    path,
    canonicalPath: path.join(' '),
    name: command.name,
    aliases: [...(command.aliases ?? [])],
    description: command.description ?? '',
    hidden: Boolean(command.hidden),
    default: Boolean(command.default),
    arguments: (command.arguments ?? []).map(normalizeArgument),
    options: (command.options ?? []).map(normalizeOption),
    disabledGlobalOptions: [...(command.disabledGlobalOptions ?? [])],
    subcommands: subcommands.map(sub => sub.name),
  });

  for (const sub of subcommands) {
    walkCommand(sub, path, out);
  }
}

export function normalizeCommandTree(
  roots: ReadonlyArray<CliCommand>
): GeneratedCommand[] {
  const commands: GeneratedCommand[] = [];
  for (const root of roots) {
    // Skip incomplete stubs such as `{ name: 'help', aliases: [] }`.
    if (root.description === undefined && !root.subcommands && !root.options) {
      continue;
    }
    walkCommand(root, [], commands);
  }
  return commands;
}

export function assertAliasIntegrity(commands: GeneratedCommand[]): void {
  const byParent = new Map<string, Map<string, string>>();

  for (const command of commands) {
    const parentKey = command.path.slice(0, -1).join(' ');
    let aliasMap = byParent.get(parentKey);
    if (!aliasMap) {
      aliasMap = new Map();
      byParent.set(parentKey, aliasMap);
    }

    const names = [command.name, ...command.aliases];
    for (const alias of names) {
      const existing = aliasMap.get(alias);
      if (existing && existing !== command.canonicalPath) {
        throw new Error(
          `Alias collision at level "${parentKey || '(root)'}": "${alias}" maps to both "${existing}" and "${command.canonicalPath}"`
        );
      }
      aliasMap.set(alias, command.canonicalPath);
    }
  }
}

export function buildAliasResolver(
  commands: GeneratedCommand[]
): (tokens: string[]) => { path: string[]; remaining: string[] } | null {
  const nodes = new Map<
    string,
    { canonical: string; children: Map<string, string> }
  >();

  // parentCanonical -> alias/name -> childCanonical
  const childMaps = new Map<string, Map<string, string>>();

  for (const command of commands) {
    const parent = command.path.slice(0, -1).join(' ');
    let map = childMaps.get(parent);
    if (!map) {
      map = new Map();
      childMaps.set(parent, map);
    }
    map.set(command.name, command.canonicalPath);
    for (const alias of command.aliases) {
      map.set(alias, command.canonicalPath);
    }
    nodes.set(command.canonicalPath, {
      canonical: command.canonicalPath,
      children: new Map(),
    });
  }

  for (const [parent, map] of childMaps) {
    if (!parent) continue;
    const node = nodes.get(parent);
    if (node) {
      node.children = map;
    }
  }

  const rootMap = childMaps.get('') ?? new Map();

  return (tokens: string[]) => {
    if (tokens.length === 0) return null;
    let currentMap = rootMap;
    let currentPath: string[] = [];
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];
      const nextCanonical = currentMap.get(token);
      if (!nextCanonical) {
        break;
      }
      currentPath = nextCanonical.split(' ');
      const node = nodes.get(nextCanonical);
      currentMap = node?.children ?? new Map();
      // Prefer the child map from childMaps keyed by canonical path.
      const fromParent = childMaps.get(nextCanonical);
      if (fromParent) {
        currentMap = fromParent;
      }
      i += 1;
    }

    if (currentPath.length === 0) {
      return null;
    }

    return {
      path: currentPath,
      remaining: tokens.slice(i),
    };
  };
}

async function importCliModule<T>(absolutePath: string): Promise<T> {
  const url = pathToFileURL(absolutePath).href;
  return (await import(url)) as T;
}

/**
 * Load the normalized command model from CLI metadata.
 * Never executes CLI commands; only imports `command.ts` metadata modules.
 */
export async function loadCommandModel(): Promise<GeneratedManifest> {
  // Deterministic output: exclude feature-flagged commands.
  delete process.env.FF_GUIDANCE_MODE;

  const indexSource = await readFile(cliCommandsIndex, 'utf8');
  const importMap = parseCommandImportMap(indexSource);
  const bindings = parseRootCommandBindings(indexSource);

  const roots: CliCommand[] = [];
  for (const binding of bindings) {
    const relative = importMap.get(binding);
    if (!relative) {
      throw new Error(`No import path found for command binding ${binding}`);
    }
    // relative like `./deploy/command` → absolute under commands dir
    const abs = join(cliCommandsDir, `${relative.replace(/^\.\//, '')}.ts`);
    const mod = await importCliModule<Record<string, CliCommand>>(abs);
    const command = mod[binding];
    if (!command || typeof command !== 'object') {
      throw new Error(`Export ${binding} missing from ${abs}`);
    }
    roots.push(command);
  }

  const commands = normalizeCommandTree(roots);
  assertAliasIntegrity(commands);

  const seen = new Set<string>();
  for (const command of commands) {
    if (seen.has(command.canonicalPath)) {
      throw new Error(`Duplicate command path: ${command.canonicalPath}`);
    }
    seen.add(command.canonicalPath);
  }

  const argCommon = await importCliModule<{
    globalCommandOptions: ReadonlyArray<{
      name: string;
      shorthand: string | null;
      type: unknown;
      argument?: string;
      deprecated: boolean;
      description?: string;
    }>;
  }>(cliArgCommon);

  const globalOptions = argCommon.globalCommandOptions.map(normalizeOption);

  return {
    commands,
    globalOptions,
  };
}

/** Visible (non-hidden) commands for public Markdown. */
export function visibleCommands(
  commands: GeneratedCommand[]
): GeneratedCommand[] {
  return commands.filter(command => !command.hidden);
}

/** Options that appear in public help / Markdown. */
export function publicOptions(options: GeneratedOption[]): GeneratedOption[] {
  return options
    .filter(option => !option.deprecated && !option.undocumented)
    .slice()
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function rootFamilies(commands: GeneratedCommand[]): GeneratedCommand[] {
  return visibleCommands(commands).filter(command => command.path.length === 1);
}
