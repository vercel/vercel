/**
 * Generates command reference material for the `skills/vercel-cli` agent
 * skill from the CLI's command specs (`src/commands/<name>/command.ts`).
 *
 * Two artifact sets ("variants") can be emitted into
 * `skills/vercel-cli/references/`:
 *
 *   index — `command-index.md`: a compact command → subcommand index with
 *           one-line descriptions and no flags (flag detail is delegated to
 *           `vercel <command> --help`).
 *   full  — `commands/<name>.md` per top-level command with synopsis,
 *           arguments, options, subcommands, and examples, plus
 *           `commands/README.md` and `commands/global-options.md`.
 *
 * Usage:
 *   pnpm generate-skill-reference [--variant index|full|all] [--check]
 *
 * `--check` regenerates in-memory and diffs against the files on disk,
 * exiting 1 on drift. Artifact sets that are not present on disk are
 * skipped, so the check only enforces whichever variant is committed.
 *
 * The filtering rules mirror the `--help` renderer in `src/commands/help.ts`:
 * hidden commands/subcommands are skipped, and options that are deprecated
 * or have no description are omitted.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { commandsStructs } from '../src/commands/index';
import { globalCommandOptions } from '../src/util/arg-common';
import type { Command, CommandOption } from '../src/commands/help';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REFERENCES_DIR = resolve(
  __dirname,
  '../../../skills/vercel-cli/references'
);

export const GENERATED_HEADER = [
  '<!-- GENERATED FILE - DO NOT EDIT.',
  '     Regenerate with: pnpm --filter vercel generate-skill-reference',
  '     Source: packages/cli/src/commands/*/command.ts -->',
  '',
].join('\n');

/**
 * Commands that must never be documented regardless of environment:
 * `help` is a synthetic registry stub, and `guidance` is only registered
 * when FF_GUIDANCE_MODE is set — excluding it keeps the generator output
 * independent of the environment it runs in.
 */
const EXCLUDED_COMMANDS = new Set(['help', 'guidance']);

export interface OptionModel {
  name: string;
  shorthand: string | null;
  argument?: string;
  type: string;
  repeatable: boolean;
  description: string;
}

export interface ArgumentModel {
  name: string;
  required: boolean;
  multiple: boolean;
}

export interface ExampleModel {
  name: string;
  value: string[];
}

export interface CommandModel {
  name: string;
  aliases: string[];
  description: string;
  isDefault: boolean;
  arguments: ArgumentModel[];
  options: OptionModel[];
  subcommands: CommandModel[];
  examples: ExampleModel[];
}

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

export function extractOptionModels(
  options: ReadonlyArray<CommandOption>
): OptionModel[] {
  // Like buildCommandOptionLines in src/commands/help.ts, but an
  // empty-string description also counts as undocumented (help renders it
  // as a blank cell; a doc bullet with no text is just noise).
  return options
    .filter(option => !option.deprecated && Boolean(option.description))
    .map(option => {
      const repeatable = Array.isArray(option.type);
      const ctor = repeatable
        ? (option.type as ReadonlyArray<{ name: string }>)[0]
        : (option.type as { name: string });
      return {
        name: option.name,
        shorthand: option.shorthand,
        argument: option.argument,
        type: ctor.name.toLowerCase(),
        repeatable,
        description: option.description as string,
      };
    })
    .sort(byName);
}

export function extractCommandModel(command: Command): CommandModel {
  return {
    name: command.name,
    aliases: [...(command.aliases ?? [])],
    description: command.description,
    isDefault: command.default === true,
    arguments: (command.arguments ?? []).map(argument => ({
      name: argument.name,
      required: argument.required,
      multiple: argument.multiple === true,
    })),
    options: extractOptionModels(command.options ?? []),
    subcommands: (command.subcommands ?? [])
      .filter(subcommand => !subcommand.hidden)
      .map(extractCommandModel)
      .sort(byName),
    examples: (command.examples ?? []).map(example => ({
      name: example.name,
      value: Array.isArray(example.value)
        ? [...example.value]
        : [example.value as string],
    })),
  };
}

function isDocumentedCommand(command: {
  name: string;
  description?: string;
  hidden?: true;
}): command is Command {
  return (
    typeof command.description === 'string' &&
    !command.hidden &&
    !EXCLUDED_COMMANDS.has(command.name)
  );
}

export function extractDocumentedCommands(): CommandModel[] {
  return (
    commandsStructs as ReadonlyArray<{
      name: string;
      description?: string;
      hidden?: true;
    }>
  )
    .filter(isDocumentedCommand)
    .map(extractCommandModel)
    .sort(byName);
}

export function extractGlobalOptions(): OptionModel[] {
  return extractOptionModels(globalCommandOptions);
}

function formatArgument(argument: ArgumentModel): string {
  const name = argument.multiple ? `${argument.name} ...` : argument.name;
  return argument.required ? `<${name}>` : `[${name}]`;
}

/**
 * Mirrors buildCommandSynopsisLine in src/commands/help.ts: when a command
 * has no positional arguments but does have subcommands, there is an
 * implicit `command` argument, optional if a default subcommand exists.
 */
function synopsis(command: CommandModel, path: string[]): string {
  const parts = ['vercel', ...path, command.name];
  const args = [...command.arguments];
  if (args.length === 0 && command.subcommands.length > 0) {
    args.push({
      name: 'command',
      required: !command.subcommands.some(subcommand => subcommand.isDefault),
      multiple: false,
    });
  }
  for (const argument of args) {
    parts.push(formatArgument(argument));
  }
  if (command.options.length > 0) {
    parts.push('[options]');
  }
  return parts.join(' ');
}

function formatOptionBullet(option: OptionModel): string {
  let flags = `--${option.name}`;
  if (option.shorthand) {
    flags = `-${option.shorthand}, ${flags}`;
  }
  if (option.argument) {
    flags += ` <${option.argument}>`;
  }
  const repeatable = option.repeatable ? ' (repeatable)' : '';
  return `- \`${flags}\`${repeatable} — ${option.description}`;
}

function formatAliases(aliases: string[]): string {
  if (aliases.length === 0) {
    return '';
  }
  const label = aliases.length === 1 ? 'alias' : 'aliases';
  return ` (${label}: ${aliases.map(alias => `\`${alias}\``).join(', ')})`;
}

/** Some descriptions span paragraphs; index bullets only get the first line. */
function firstLine(description: string): string {
  return description.split('\n')[0].trim();
}

function renderIndexSubcommands(
  subcommands: CommandModel[],
  indent: string,
  lines: string[]
): void {
  for (const subcommand of subcommands) {
    const args = subcommand.arguments.map(formatArgument).join(' ');
    const invocation = [subcommand.name, args].filter(Boolean).join(' ');
    const suffix = subcommand.isDefault ? ' (default)' : '';
    lines.push(
      `${indent}- \`${invocation}\` — ${firstLine(subcommand.description)}${suffix}`
    );
    renderIndexSubcommands(subcommand.subcommands, `${indent}  `, lines);
  }
}

/** Variant "index": a compact discoverability index with no flags. */
export function renderCommandIndex(models: CommandModel[]): string {
  const lines: string[] = [
    GENERATED_HEADER,
    '# Vercel CLI Command Index',
    '',
    'Every command and subcommand in the Vercel CLI (`vercel`, alias `vc`), generated from the CLI source.',
    '',
    'This index is for discovering which command exists for a task. For flags, arguments, and defaults, run `vercel <command> [subcommand] --help` — help prints to stderr and may exit with code 2 after printing usage. If a command listed here is missing from your CLI, your installed CLI is older; check `vercel --help`.',
    '',
  ];
  for (const model of models) {
    lines.push(`## \`vercel ${model.name}\`${formatAliases(model.aliases)}`);
    lines.push('');
    lines.push(firstLine(model.description));
    lines.push('');
    if (model.subcommands.length > 0) {
      renderIndexSubcommands(model.subcommands, '', lines);
      lines.push('');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function renderCommandSections(
  command: CommandModel,
  path: string[],
  depth: number
): string[] {
  // Cap heading depth so deeply nested subcommands stay readable markdown.
  const heading = '#'.repeat(Math.min(depth, 5));
  const fullName = ['vercel', ...path, command.name].join(' ');
  const title =
    path.length > 0 ? `${heading} \`${fullName}\`` : `${heading} ${fullName}`;
  const lines: string[] = [title, ''];
  lines.push(
    command.description + (command.isDefault ? ' (default subcommand)' : '')
  );
  lines.push('');
  if (command.aliases.length > 0) {
    lines.push(
      `Aliases: ${command.aliases.map(alias => `\`${alias}\``).join(', ')}`
    );
    lines.push('');
  }
  lines.push('```');
  lines.push(synopsis(command, path));
  lines.push('```');
  lines.push('');
  if (command.options.length > 0) {
    lines.push(`${heading}# Options`);
    lines.push('');
    for (const option of command.options) {
      lines.push(formatOptionBullet(option));
    }
    lines.push('');
  }
  if (command.subcommands.length > 0) {
    if (path.length === 0) {
      lines.push(`${heading}# Subcommands`);
      lines.push('');
    }
    for (const subcommand of command.subcommands) {
      lines.push(
        ...renderCommandSections(subcommand, [...path, command.name], depth + 2)
      );
    }
  }
  if (command.examples.length > 0) {
    lines.push(`${heading}# Examples`);
    lines.push('');
    for (const example of command.examples) {
      lines.push(example.name);
      lines.push('');
      lines.push('```');
      for (const value of example.value) {
        lines.push(`$ ${value}`);
      }
      lines.push('```');
      lines.push('');
    }
  }
  return lines;
}

/** Variant "full": one file per top-level command plus README and global options. */
export function renderFullReference(
  models: CommandModel[],
  globalOptions: OptionModel[]
): Record<string, string> {
  const files: Record<string, string> = {};
  for (const model of models) {
    const lines = [GENERATED_HEADER, ...renderCommandSections(model, [], 1)];
    lines.push(
      'Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.'
    );
    files[`commands/${model.name}.md`] = `${lines.join('\n').trimEnd()}\n`;
  }

  const globalLines = [
    GENERATED_HEADER,
    '# Global Options',
    '',
    'These options apply to every `vercel` command.',
    '',
    ...globalOptions.map(formatOptionBullet),
  ];
  files['commands/global-options.md'] = `${globalLines.join('\n').trimEnd()}\n`;

  const readmeLines = [
    GENERATED_HEADER,
    '# Vercel CLI Command Reference',
    '',
    'Generated per-command reference. If a command or flag listed here is missing from your CLI, your installed CLI is older; `vercel <command> --help` reflects what is actually installed.',
    '',
    '- [Global options](global-options.md)',
    ...models.map(
      model =>
        `- [\`vercel ${model.name}\`](${model.name}.md) — ${model.description}`
    ),
  ];
  files['commands/README.md'] = `${readmeLines.join('\n').trimEnd()}\n`;

  return files;
}

export function renderIndexArtifacts(): Record<string, string> {
  return {
    'command-index.md': renderCommandIndex(extractDocumentedCommands()),
  };
}

export function renderFullArtifacts(): Record<string, string> {
  return renderFullReference(
    extractDocumentedCommands(),
    extractGlobalOptions()
  );
}

interface CheckResult {
  missing: string[];
  outdated: string[];
  stale: string[];
}

/**
 * Compares rendered artifacts against the files on disk, reporting files
 * that are missing, differ in content, or exist under `commands/` without
 * a corresponding rendered artifact (stale after a command was removed).
 */
export function checkArtifacts(
  artifacts: Record<string, string>,
  referencesDir: string
): CheckResult {
  const result: CheckResult = { missing: [], outdated: [], stale: [] };
  for (const [relPath, content] of Object.entries(artifacts)) {
    const absPath = join(referencesDir, relPath);
    if (!existsSync(absPath)) {
      result.missing.push(relPath);
    } else if (readFileSync(absPath, 'utf8') !== content) {
      result.outdated.push(relPath);
    }
  }
  const commandsDir = join(referencesDir, 'commands');
  if (existsSync(commandsDir)) {
    const expected = new Set(
      Object.keys(artifacts)
        .filter(relPath => relPath.startsWith('commands/'))
        .map(relPath => relPath.slice('commands/'.length))
    );
    for (const entry of readdirSync(commandsDir)) {
      if (expected.size > 0 && !expected.has(entry)) {
        result.stale.push(`commands/${entry}`);
      }
    }
  }
  return result;
}

function writeArtifacts(
  artifacts: Record<string, string>,
  referencesDir: string
): void {
  for (const [relPath, content] of Object.entries(artifacts)) {
    const absPath = join(referencesDir, relPath);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, content);
    console.log(`wrote ${absPath}`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const variantIndex = args.indexOf('--variant');
  const variant = variantIndex === -1 ? 'all' : args[variantIndex + 1];
  if (!['index', 'full', 'all'].includes(variant)) {
    console.error(`unknown --variant "${variant}" (expected index|full|all)`);
    process.exit(2);
  }

  const artifacts: Record<string, string> = {
    ...(variant === 'index' || variant === 'all' ? renderIndexArtifacts() : {}),
    ...(variant === 'full' || variant === 'all' ? renderFullArtifacts() : {}),
  };

  if (!check) {
    writeArtifacts(artifacts, REFERENCES_DIR);
    return;
  }

  // Check mode: only enforce artifact sets that are present on disk, so the
  // repo can commit either variant (or neither) and the check scopes itself.
  const indexCommitted = existsSync(join(REFERENCES_DIR, 'command-index.md'));
  const fullCommitted = existsSync(join(REFERENCES_DIR, 'commands'));
  const enforced: Record<string, string> = {};
  for (const [relPath, content] of Object.entries(artifacts)) {
    const isFull = relPath.startsWith('commands/');
    if ((isFull && fullCommitted) || (!isFull && indexCommitted)) {
      enforced[relPath] = content;
    }
  }
  if (Object.keys(enforced).length === 0) {
    console.log(
      'no generated skill-reference artifacts committed; nothing to check'
    );
    return;
  }

  const { missing, outdated, stale } = checkArtifacts(enforced, REFERENCES_DIR);
  const problems = [...missing, ...outdated, ...stale];
  if (problems.length > 0) {
    console.error(
      [
        'skill reference is out of date with the command specs:',
        ...missing.map(path => `  missing:  ${path}`),
        ...outdated.map(path => `  outdated: ${path}`),
        ...stale.map(path => `  stale:    ${path}`),
        '',
        'regenerate with: pnpm --filter vercel generate-skill-reference',
      ].join('\n')
    );
    process.exit(1);
  }
  console.log('skill reference is up to date');
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main();
}
