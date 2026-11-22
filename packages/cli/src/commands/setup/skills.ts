import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import {
  buildCommandWithGlobalFlags,
  shouldEmitNonInteractiveCommandError,
  writeAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import pkg from '../../util/pkg';
import {
  readBundledCliSkill,
  type BundledSkill,
} from '../../util/skills/bundled-files';
import { SetupSkillsTelemetryClient } from '../../util/telemetry/commands/setup/skills';
import { skillsSubcommand } from './command';

/**
 * - `outdated`: a `vercel-cli` skill (its `SKILL.md` names it) with other contents.
 * - `foreign`: a non-empty directory that isn't a `vercel-cli` skill, such as a
 *   skills root holding other skills. It is never replaced.
 */
type DestinationState =
  | 'missing'
  | 'empty'
  | 'identical'
  | 'outdated'
  | 'foreign'
  | 'not_directory';

interface Failure {
  reason: string;
  headline: string;
  recovery?: { instruction: string; command: string };
  exitCode: number;
}

/**
 * `vercel setup skills [--output <PATH>]`: writes the `vercel-cli` agent skill
 * bundled with this CLI version into `~/.agents/skills/vercel-cli`, or into
 * `--output` for agents whose skill directory the CLI doesn't know.
 *
 * The write is all-or-nothing: files go into a sibling temporary directory
 * that is renamed into place. An older `vercel-cli` skill at the destination
 * is replaced; a directory holding anything else is never touched.
 */
export default async function setupSkills(client: Client): Promise<number> {
  const telemetry = new SetupSkillsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(skillsSubcommand.options)
    );
  } catch (error) {
    printError(error);
    return 2;
  }

  const { flags } = parsedArgs;
  telemetry.trackCliOptionOutput(flags['--output']);
  telemetry.trackCliFlagDryRun(flags['--dry-run']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliOptionFormat(flags['--format']);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;
  const machine = asJson || shouldEmitNonInteractiveCommandError(client);
  const fail = (failure: Failure) => reportFailure(client, machine, failure);
  const skill = readBundledCliSkill();

  // args: ['setup', 'skills', ...positionals]
  if (parsedArgs.args.length > 2) {
    return fail({
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      headline:
        "vercel setup skills doesn't take arguments. Pass a destination with --output.",
      exitCode: 2,
    });
  }

  const outputFlag = flags['--output'];
  if (outputFlag === '' || outputFlag === '-') {
    return fail({
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      headline: "Can't set up skills. --output must be a directory path.",
      exitCode: 2,
    });
  }

  const home = homedir();
  const destination =
    outputFlag === undefined
      ? join(home, '.agents', 'skills', skill.name)
      : resolve(client.cwd, outputFlag);
  const shownPath = formatPath(client.cwd, home, destination);
  const dryRun = flags['--dry-run'] ?? false;

  try {
    if (await escapesThroughSymlink(client.cwd, destination)) {
      return fail({
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        headline: `Can't write the ${skill.name} skill to ${shownPath}. It resolves through a symlink outside ${client.cwd}.`,
        exitCode: 2,
      });
    }

    const state = await readDestinationState(destination, skill);
    if (state === 'not_directory') {
      return fail({
        reason: AGENT_REASON.CONFLICT,
        headline: `Can't write the ${skill.name} skill to ${shownPath}. A file already exists there.`,
        exitCode: 1,
      });
    }
    if (state === 'foreign') {
      return fail({
        reason: AGENT_REASON.CONFLICT,
        headline: `Can't write the ${skill.name} skill to ${shownPath}. It holds other files, not a ${skill.name} skill.`,
        recovery:
          outputFlag === undefined
            ? undefined
            : {
                instruction: 'To write the skill into its own directory there',
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  `setup skills --output ${shellQuote(`${outputFlag.replace(/[\\/]+$/, '')}/${skill.name}`)}`
                ),
              },
        exitCode: 1,
      });
    }
    if (state === 'identical') {
      reportSuccess(client, asJson, {
        skill,
        destination,
        shownPath,
        outcome: 'unchanged',
        replaced: false,
      });
      return 0;
    }

    // An older `vercel-cli` skill is the thing this command maintains, so it is
    // updated without asking; anything else was refused above.
    const replacing = state === 'outdated';
    if (dryRun) {
      reportSuccess(client, asJson, {
        skill,
        destination,
        shownPath,
        outcome: 'planned',
        replaced: replacing,
      });
      return 0;
    }

    await writeSkillDirectory(destination, skill, state !== 'missing');
    reportSuccess(client, asJson, {
      skill,
      destination,
      shownPath,
      outcome: 'added',
      replaced: replacing,
    });
    return 0;
  } catch (error) {
    // Local filesystem failures (permissions, a full disk) end here.
    return fail({
      reason: 'write_failed',
      headline: `Failed to write the ${skill.name} skill to ${shownPath}. ${errorMessage(error)}`,
      exitCode: 1,
    });
  }
}

async function readDestinationState(
  destination: string,
  skill: BundledSkill
): Promise<DestinationState> {
  let stats;
  try {
    stats = await lstat(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw error;
  }
  if (!stats.isDirectory()) return 'not_directory';

  const existing = await listFiles(destination, '');
  if (existing.length === 0) return 'empty';
  if (!(await holdsSkillNamed(destination, skill.name))) return 'foreign';
  if (existing.length !== skill.files.length) return 'outdated';
  for (const file of skill.files) {
    if (!existing.includes(file.path)) return 'outdated';
    const content = await readFile(join(destination, file.path), 'utf8');
    if (content !== file.content) return 'outdated';
  }
  return 'identical';
}

/** True when `<dir>/SKILL.md` has frontmatter with `name: <name>`. */
async function holdsSkillNamed(dir: string, name: string): Promise<boolean> {
  let content;
  try {
    content = await readFile(join(dir, 'SKILL.md'), 'utf8');
  } catch {
    return false;
  }
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1] ?? '';
  return frontmatter
    .split(/\r?\n/)
    .some(line => /^name:\s*['"]?([\w-]+)['"]?\s*$/.exec(line)?.[1] === name);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function listFiles(dir: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(join(dir, entry.name), path)));
    } else {
      files.push(path);
    }
  }
  return files;
}

/**
 * Writes the skill into a temporary sibling directory, then renames it into
 * place. When replacing, the previous directory moves aside first and is
 * deleted only after the new one is in place.
 */
async function writeSkillDirectory(
  destination: string,
  skill: BundledSkill,
  replace: boolean
): Promise<void> {
  const parent = dirname(destination);
  const suffix = randomBytes(6).toString('hex');
  const temporary = join(parent, `.${basename(destination)}.tmp-${suffix}`);
  const previous = join(parent, `.${basename(destination)}.old-${suffix}`);

  await mkdir(parent, { recursive: true });
  await mkdir(temporary);
  try {
    for (const file of skill.files) {
      const target = resolve(temporary, file.path);
      const rel = relative(temporary, target);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error(
          `Bundled skill file escapes its directory: ${file.path}`
        );
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, 'utf8');
    }
    if (replace) {
      await rename(destination, previous);
      try {
        await rename(temporary, destination);
      } catch (error) {
        await rename(previous, destination);
        throw error;
      }
      await rm(previous, { recursive: true, force: true });
    } else {
      await rename(temporary, destination);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/**
 * True when `destination` is under `cwd` but its nearest existing ancestor
 * resolves outside `cwd`. Destinations given outside `cwd` are taken as-is.
 */
async function escapesThroughSymlink(
  cwd: string,
  destination: string
): Promise<boolean> {
  if (!isWithin(cwd, destination)) return false;
  const realCwd = await realpath(cwd);
  let current = destination;
  for (;;) {
    try {
      return !isWithin(realCwd, await realpath(current));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = dirname(current);
      if (parent === current) return false;
      current = parent;
    }
  }
}

function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  // Only a `..` segment leaves `root`; a child named `..skills` stays inside.
  return (
    rel === '' ||
    (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

function formatPath(cwd: string, home: string, path: string): string {
  if (isWithin(cwd, path)) return relative(cwd, path) || '.';
  if (isWithin(home, path)) return join('~', relative(home, path));
  return path;
}

function shellQuote(value: string): string {
  return /^[\w./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

function reportFailure(
  client: Client,
  machine: boolean,
  failure: Failure
): number {
  if (machine) {
    writeAgentError(client, {
      status: 'error',
      reason: failure.reason,
      message: failure.headline,
      next: failure.recovery
        ? [
            {
              command: failure.recovery.command,
              when: failure.recovery.instruction,
            },
          ]
        : undefined,
    });
    return failure.exitCode;
  }
  output.error(failure.headline);
  if (failure.recovery) {
    output.print(
      `\n  ${failure.recovery.instruction}:\n    ${failure.recovery.command}\n`
    );
  }
  return failure.exitCode;
}

function reportSuccess(
  client: Client,
  asJson: boolean,
  result: {
    skill: BundledSkill;
    destination: string;
    shownPath: string;
    outcome: 'added' | 'unchanged' | 'planned';
    replaced: boolean;
  }
): void {
  const { skill, destination, shownPath, outcome, replaced } = result;

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          skill: {
            name: skill.name,
            path: destination,
            files: skill.files.map(file => file.path),
            cliVersion: pkg.version,
          },
          outcome,
          replaced,
          ...(outcome === 'planned' && {
            changes: [
              { id: destination, change: replaced ? 'updated' : 'added' },
            ],
          }),
        },
        null,
        client.stdout.isTTY ? 2 : undefined
      )}\n`
    );
    return;
  }

  if (outcome === 'unchanged') {
    output.print(
      `  ${shownPath} already has the ${skill.name} skill from Vercel CLI ${pkg.version}.\n`
    );
  } else if (outcome === 'planned') {
    output.print(
      `  Would ${replaced ? 'replace' : 'add'} the ${skill.name} skill from Vercel CLI ${pkg.version} in ${shownPath}. Nothing was written.\n`
    );
    return;
  } else {
    printAlignedLabel('Added', skill.name, { gutter: '✓' });
    printAlignedLabel('Path', shownPath);
    if (replaced) printAlignedLabel('Replaced', 'previous version');
    printAlignedLabel('Version', `Vercel CLI ${pkg.version}`);
  }

  // The stdout identifier: the skill's directory, for `dir=$(vercel setup skills ...)`.
  if (!client.stdout.isTTY || client.nonInteractive) {
    client.stdout.write(`${destination}\n`);
  }
}
