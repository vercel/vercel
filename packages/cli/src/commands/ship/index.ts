import chalk from 'chalk';
import { isAbsolute, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import cmd from '../../util/output/cmd';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import { help } from '../help';
import { shipCommand } from './command';
import { ShipTelemetryClient } from '../../util/telemetry/commands/ship';
import {
  availableHarnesses,
  detectHarnesses,
  HARNESS_DEFINITIONS,
  type DetectedHarness,
  type HarnessId,
} from './detect-harnesses';
import { collectPreflight, formatPreflight } from './preflight';
import { renderMission, renderMissionFromFile } from './instructions';
import { runSession } from './run-session';

const DRY_RUN_SUFFIX = `

---

## Override: dry run

This session is a **dry run**. Complete Phase 1 and Phase 2 only. Produce the
inventory and the plan, then stop and report.

Do not create or modify any file. Do not run \`vercel link\`. Do not provision any
resource. Do not deploy. Read-only commands are fine.
`;

const STATUS_LABEL: Record<DetectedHarness['status'], string> = {
  ready: chalk.green('ready'),
  unverified: chalk.yellow('installed, auth unverified'),
  missing: chalk.gray('not found'),
};

export default async function ship(client: Client): Promise<number> {
  const flagsSpecification = getFlagsSpecification(shipCommand.options);
  const telemetry = new ShipTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('ship');
    output.print(help(shipCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const pathArgument = parsedArgs.args[1];
  const harnessFlag = parsedArgs.flags['--harness'];
  const listHarnesses = parsedArgs.flags['--list-harnesses'] ?? false;
  const printPrompt = parsedArgs.flags['--print-prompt'] ?? false;
  const promptFile = parsedArgs.flags['--prompt'];
  const dryRun = parsedArgs.flags['--dry-run'] ?? false;
  const json = parsedArgs.flags['--json'] ?? false;
  const skipConfirmation = parsedArgs.flags['--yes'] ?? false;

  telemetry.trackCliArgumentPath(pathArgument);
  telemetry.trackCliOptionHarness(harnessFlag);
  telemetry.trackCliOptionPrompt(promptFile);
  telemetry.trackCliFlagListHarnesses(listHarnesses);
  telemetry.trackCliFlagPrintPrompt(printPrompt);
  telemetry.trackCliFlagDryRun(dryRun);
  telemetry.trackCliFlagJson(json);
  telemetry.trackCliFlagYes(skipConfirmation);

  try {
    return await runShip(client, {
      pathArgument,
      harnessFlag,
      listHarnesses,
      printPrompt,
      promptFile,
      dryRun,
      skipConfirmation,
      jsonFlags: parsedArgs.flags,
    });
  } catch (error) {
    printError(error);
    return 1;
  }
}

interface ShipOptions {
  pathArgument?: string;
  harnessFlag?: string;
  listHarnesses: boolean;
  printPrompt: boolean;
  promptFile?: string;
  dryRun: boolean;
  skipConfirmation: boolean;
  jsonFlags: Record<string, unknown>;
}

async function runShip(client: Client, options: ShipOptions): Promise<number> {
  const harnesses = await detectHarnesses();

  if (options.listHarnesses) {
    return printHarnessList(client, harnesses, options.jsonFlags);
  }

  const workspace = await resolveWorkspace(client, options.pathArgument);
  if (!workspace) {
    return 1;
  }

  // The prompt is composed before a harness is selected so `--print-prompt`
  // works on a machine with no coding agent installed at all.
  const preflight = await collectPreflight(client, workspace);
  const context = {
    workspace,
    vercelContext: formatPreflight(preflight),
  };

  let prompt = options.promptFile
    ? await renderMissionFromFile(
        resolve(client.cwd, options.promptFile),
        context
      )
    : renderMission(context);

  if (options.dryRun) {
    prompt += DRY_RUN_SUFFIX;
  }

  if (options.printPrompt) {
    client.stdout.write(prompt.endsWith('\n') ? prompt : `${prompt}\n`);
    return 0;
  }

  const harness = await selectHarness(client, harnesses, options);
  if (!harness) {
    return 1;
  }

  if (!options.skipConfirmation) {
    const decision = await confirmSession(client, harness, workspace, options);
    if (decision === 'declined') {
      output.log('Canceled.');
      return 0;
    }
    // `blocked` already reported why prompting was not possible.
    if (decision === 'blocked') {
      return 1;
    }
  }

  return runSession({
    client,
    harness,
    workspace,
    prompt,
    autoApprove: options.skipConfirmation,
  });
}

/**
 * Resolve and validate the directory the agent will be scoped to.
 */
async function resolveWorkspace(
  client: Client,
  pathArgument?: string
): Promise<string | undefined> {
  const workspace = pathArgument
    ? isAbsolute(pathArgument)
      ? pathArgument
      : resolve(client.cwd, pathArgument)
    : client.cwd;

  try {
    const stats = await stat(workspace);
    if (!stats.isDirectory()) {
      output.error(`Not a directory: ${workspace}`);
      return undefined;
    }
  } catch {
    output.error(`Directory does not exist: ${workspace}`);
    return undefined;
  }

  return workspace;
}

function printHarnessList(
  client: Client,
  harnesses: DetectedHarness[],
  flags: Record<string, unknown>
): number {
  const format = validateJsonOutput(flags);
  if (!format.valid) {
    output.error(format.error);
    return 1;
  }

  if (format.jsonOutput) {
    client.stdout.write(
      `${JSON.stringify(
        {
          harnesses: harnesses.map(harness => ({
            id: harness.id,
            label: harness.label,
            status: harness.status,
            version: harness.version,
            binPath: harness.binPath,
            detail: harness.detail,
          })),
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.print('\n');
  for (const harness of harnesses) {
    const version = harness.version ? chalk.gray(` ${harness.version}`) : '';
    output.print(
      `  ${harness.id.padEnd(12)} ${STATUS_LABEL[harness.status]}${version}\n`
    );
  }
  output.print('\n');

  if (availableHarnesses(harnesses).length === 0) {
    printInstallHelp();
  }

  return 0;
}

/**
 * Choose the harness to drive the session.
 *
 * An explicit `--harness` always wins. A single detected harness is used without
 * a prompt. Several detected harnesses prompt interactively, and fail with a
 * clear instruction when prompting is not possible.
 */
async function selectHarness(
  client: Client,
  harnesses: DetectedHarness[],
  options: ShipOptions
): Promise<DetectedHarness | undefined> {
  if (options.harnessFlag) {
    return selectRequestedHarness(harnesses, options.harnessFlag);
  }

  const available = availableHarnesses(harnesses);

  if (available.length === 0) {
    output.error('No supported coding agent was found on this machine.');
    printInstallHelp();
    return undefined;
  }

  if (available.length === 1) {
    const [only] = available;
    output.log(`Using ${only.label}.`);
    return only;
  }

  if (!client.stdin.isTTY) {
    output.error(
      `Multiple coding agents found (${available
        .map(harness => harness.id)
        .join(', ')}). Pass --harness to choose one.`
    );
    return undefined;
  }

  return client.input.select<DetectedHarness>({
    message: 'Which coding agent should drive this?',
    choices: available.map(harness => ({
      name:
        harness.status === 'ready'
          ? harness.label
          : `${harness.label} ${chalk.yellow('(auth unverified)')}`,
      value: harness,
    })),
  });
}

function selectRequestedHarness(
  harnesses: DetectedHarness[],
  requested: string
): DetectedHarness | undefined {
  const known = HARNESS_DEFINITIONS.some(
    definition => definition.id === (requested as HarnessId)
  );

  if (!known) {
    output.error(
      `Unknown harness "${requested}". Supported: ${HARNESS_DEFINITIONS.map(
        definition => definition.id
      ).join(', ')}`
    );
    return undefined;
  }

  const harness = harnesses.find(candidate => candidate.id === requested);

  if (!harness || harness.status === 'missing') {
    output.error(
      `The harness "${requested}" is not available on this machine (${
        harness?.detail ?? 'not found'
      }).`
    );
    const definition = HARNESS_DEFINITIONS.find(
      candidate => candidate.id === requested
    );
    if (definition) {
      output.log(`Install it with: ${chalk.cyan(definition.installHint)}`);
    }
    return undefined;
  }

  return harness;
}

/**
 * `accepted` — proceed. `declined` — the user said no, a normal exit.
 * `blocked`  — prompting was impossible, an operational failure.
 */
type SessionDecision = 'accepted' | 'declined' | 'blocked';

async function confirmSession(
  client: Client,
  harness: DetectedHarness,
  workspace: string,
  options: ShipOptions
): Promise<SessionDecision> {
  output.print('\n');
  output.print(`  ${chalk.bold('Workspace')}  ${workspace}\n`);
  output.print(`  ${chalk.bold('Agent')}      ${harness.label}\n`);
  output.print('\n');

  if (options.dryRun) {
    output.print(
      `  ${harness.label} will inspect this project and produce a plan.\n` +
        '  Nothing will be created, modified, or deployed.\n\n'
    );
  } else {
    output.print(
      `  ${harness.label} will read and modify files in this directory, and can\n` +
        '  provision paid resources and deploy. It is instructed to ask before\n' +
        '  anything that costs money, and to deploy previews only.\n\n'
    );
  }

  if (!client.stdin.isTTY) {
    output.error(
      `Cannot prompt for confirmation in non-interactive mode. Re-run with ${cmd(
        '--yes'
      )} to proceed.`
    );
    return 'blocked';
  }

  return (await client.input.confirm('Continue?', true))
    ? 'accepted'
    : 'declined';
}

function printInstallHelp(): void {
  output.log('Install one of these to continue:\n');
  for (const definition of HARNESS_DEFINITIONS) {
    if (!definition.bin) continue;
    output.print(
      `  ${definition.label.padEnd(14)} ${chalk.cyan(definition.installHint)}\n`
    );
  }
  output.print('\n');
}
