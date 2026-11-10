import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type arg from 'arg';
import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../util/client';
import { buildCommandWithYes } from '../../util/agent-output';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { getCommandName } from '../../util/pkg-name';
import { formatProject } from '../../util/projects/format-project';
import output from '../../output-manager';
import type { Command } from '../help';
import {
  getLinkedFlagsProject,
  getProjectNameFromFlags,
} from '../flags/project';
import { getExperiment } from './api';
import {
  buildExperimentNextCommands,
  getExperimentIdentifier,
  printNextCommands,
} from './output';
import type { Experiment, NextCommand } from './types';

export type ParsedFlags = Record<string, unknown>;
export type ProjectContext = Extract<
  Awaited<ReturnType<typeof getLinkedFlagsProject>>,
  { status: 'linked' }
>;

export function isJson(flags: ParsedFlags): boolean {
  return flags['--format'] === 'json';
}

export function validateFormat(flags: ParsedFlags): boolean {
  const format = flags['--format'];
  if (format === undefined || format === 'json') return true;
  output.error('The --format option only accepts `json`.');
  return false;
}

export async function resolveProject(
  client: Client,
  flags: ParsedFlags
): Promise<ProjectContext | number> {
  const projectName = getProjectNameFromFlags(flags);
  const link = await getLinkedFlagsProject(client, projectName);
  if (link.status === 'error') return link.exitCode;
  if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project. Pass --project <name-or-id>, or run ${getCommandName('link')}.`
    );
    return 1;
  }
  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;
  return link;
}

export function parseSubcommand(
  argv: string[],
  command: Command
): { args: string[]; flags: ParsedFlags } | undefined {
  try {
    const parsed = parseArguments(
      argv,
      getFlagsSpecification(command.options) as arg.Spec
    ) as {
      args: string[];
      flags: ParsedFlags;
    };
    return validateFormat(parsed.flags) ? parsed : undefined;
  } catch (error) {
    printError(error);
    return undefined;
  }
}

function requireExperimentArgument(
  args: string[],
  usage: string
): string | undefined {
  const [experiment, extra] = args;
  if (!experiment) {
    output.error(
      `Missing required argument: experiment. Usage: ${getCommandName(usage)}`
    );
    return undefined;
  }
  if (extra) {
    output.error(`Too many arguments. Usage: ${getCommandName(usage)}`);
    return undefined;
  }
  return experiment;
}

export function writeJson(client: Client, value: unknown): void {
  client.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export const EXPERIMENTS_NOT_ENABLED_MESSAGE =
  'Experiments are not enabled for this team.';
export const EXPERIMENTS_LIMITED_PREVIEW_MESSAGE =
  'This command is currently in limited preview and isn’t enabled for your team.';

export function printExperimentError(
  client: Client,
  error: unknown,
  json = false
): void {
  if (
    isAPIError(error) &&
    error.status === 403 &&
    error.serverMessage === EXPERIMENTS_NOT_ENABLED_MESSAGE
  ) {
    if (json || client.nonInteractive) {
      writeJson(client, {
        status: 'error',
        reason: 'experiments_not_enabled',
        message: EXPERIMENTS_LIMITED_PREVIEW_MESSAGE,
        userActionRequired: true,
      });
    } else {
      output.error(EXPERIMENTS_LIMITED_PREVIEW_MESSAGE);
    }
    return;
  }
  printError(error);
}

export function jsonResult(
  experiment: Experiment,
  next: NextCommand[],
  extra: JSONObject = {}
): JSONObject {
  return {
    status: 'success',
    experiment: experiment as unknown as JSONObject,
    ...extra,
    next: next as unknown as JSONObject,
  };
}

export function printMutationPreview(
  link: ProjectContext,
  experiment: Experiment,
  transition: string,
  effect: string
): void {
  const experimentIdentifier = getExperimentIdentifier(experiment);
  printAlignedLabel('Project', formatProject(link.org.slug, link.project.name));
  printAlignedLabel('Experiment', experimentIdentifier);
  printAlignedLabel('State', transition);
  printAlignedLabel('Feature Flag', experiment.flagSlug);
  printAlignedLabel('Effect', effect);
  output.print('\n');
}

export async function confirmMutation({
  client,
  flags,
  link,
  experiment,
  transition,
  effect,
  prompt,
}: {
  client: Client;
  flags: ParsedFlags;
  link: ProjectContext;
  experiment: Experiment;
  transition: string;
  effect: string;
  prompt: string;
}): Promise<number | undefined> {
  const json = isJson(flags);
  const yes = flags['--yes'] === true;

  if (!json) {
    printMutationPreview(link, experiment, transition, effect);
  }
  if (yes) return undefined;

  if (json || client.nonInteractive || !client.stdin.isTTY) {
    const nextCommand = buildCommandWithYes(client.argv);
    if (json || client.nonInteractive) {
      writeJson(client, {
        status: 'action_required',
        reason: 'confirmation_required',
        message: 'Re-run with --yes to apply this production change.',
        userActionRequired: true,
        next: [{ command: nextCommand }],
      });
    } else {
      output.error(`Missing required option --yes. Re-run \`${nextCommand}\`.`);
    }
    return 2;
  }

  return (await client.input.confirm(prompt, false))
    ? undefined
    : outputCanceled();
}

export function outputCanceled(): number {
  output.log('Canceled');
  return 0;
}

async function readAllStdin(client: Client): Promise<string> {
  if (client.stdin.isTTY) return '';
  const chunks: string[] = [];
  client.stdin.setEncoding('utf8');
  for await (const chunk of client.stdin) {
    chunks.push(String(chunk));
  }
  return chunks.join('');
}

export async function readJsonObject(
  client: Client,
  file: unknown
): Promise<JSONObject | undefined> {
  if (typeof file !== 'string') {
    output.error('Missing required option --file <file>.');
    return undefined;
  }

  try {
    const source =
      file === '-'
        ? await readAllStdin(client)
        : await readFile(resolve(client.cwd, file), 'utf8');
    if (!source.trim()) {
      output.error(
        file === '-'
          ? 'No JSON received on stdin for --file -.'
          : `The file ${file} is empty.`
      );
      return undefined;
    }
    const value: unknown = JSON.parse(source);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      output.error('The JSON request body must be an object.');
      return undefined;
    }
    return value as JSONObject;
  } catch (error) {
    output.error(
      `Failed to read experiment JSON: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

export async function fetchExperimentContext(
  client: Client,
  parsed: { args: string[]; flags: ParsedFlags },
  usage: string
): Promise<{ link: ProjectContext; experiment: Experiment } | number> {
  const id = requireExperimentArgument(parsed.args, usage);
  if (!id) return 2;
  const link = await resolveProject(client, parsed.flags);
  if (typeof link === 'number') return link;
  try {
    output.spinner('Fetching experiment…');
    const experiment = await getExperiment(client, link.project.id, id);
    output.stopSpinner();
    return { link, experiment };
  } catch (error) {
    output.stopSpinner();
    printExperimentError(client, error, isJson(parsed.flags));
    return 1;
  }
}

export async function mutateExperiment(
  client: Client,
  flags: ParsedFlags,
  context: { link: ProjectContext; experiment: Experiment },
  spinner: string,
  mutation: () => Promise<Experiment>,
  resultLabel: string
): Promise<number> {
  try {
    output.spinner(spinner);
    const experiment = await mutation();
    output.stopSpinner();
    const next = buildExperimentNextCommands(client, experiment);
    if (isJson(flags)) {
      writeJson(client, jsonResult(experiment, next));
    } else {
      printAlignedLabel(resultLabel, experiment.name, { gutter: '✓' });
      printAlignedLabel('State', experiment.state);
      printAlignedLabel('Feature Flag', experiment.flagSlug);
      if (experiment.rampPercentage !== undefined) {
        printAlignedLabel('Ramp', `${experiment.rampPercentage}%`);
      }
      printNextCommands(next);
    }
    return 0;
  } catch (error) {
    output.stopSpinner();
    printExperimentError(client, error, isJson(flags));
    return 1;
  }
}

export async function confirmAndMutateExperiment({
  client,
  flags,
  context,
  transition,
  effect,
  prompt,
  spinner,
  mutation,
  resultLabel,
}: {
  client: Client;
  flags: ParsedFlags;
  context: { link: ProjectContext; experiment: Experiment };
  transition: string;
  effect: string;
  prompt: string;
  spinner: string;
  mutation: () => Promise<Experiment>;
  resultLabel: string;
}): Promise<number> {
  const confirmation = await confirmMutation({
    client,
    flags,
    link: context.link,
    experiment: context.experiment,
    transition,
    effect,
    prompt,
  });
  if (confirmation !== undefined) return confirmation;
  return mutateExperiment(
    client,
    flags,
    context,
    spinner,
    mutation,
    resultLabel
  );
}

export function parseRamp(flags: ParsedFlags): number | undefined {
  const ramp = flags['--ramp'];
  if (
    typeof ramp !== 'number' ||
    !Number.isFinite(ramp) ||
    ramp < 0 ||
    ramp > 100
  ) {
    output.error('Provide --ramp as a percentage from 0 to 100.');
    return undefined;
  }
  return ramp;
}

export function requireExperimentState(
  experiment: Experiment,
  expected: Experiment['state'] | Experiment['state'][],
  action: string
): boolean {
  const states = Array.isArray(expected) ? expected : [expected];
  if (states.includes(experiment.state)) return true;
  output.error(
    `Cannot ${action} while the experiment is ${experiment.state}. Expected state: ${states.join(' or ')}.`
  );
  return false;
}

export function unitKeyFromBase(experiment: Experiment): string {
  const { kind, attribute } = experiment.base;
  if (
    attribute === 'id' &&
    (kind === 'device' || kind === 'user' || kind === 'group')
  ) {
    return `${kind}_id`;
  }
  const normalized =
    attribute === 'id'
      ? `${kind.replace(/[^A-Za-z0-9_]/g, '_')}Id`
      : attribute.replace(/[^A-Za-z0-9_]/g, '_');
  return `event_data.${normalized}`;
}
