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
import { onboardCommand } from './command';
import { OnboardTelemetryClient } from '../../util/telemetry/commands/onboard';
import {
  availableHarnesses,
  detectHarnesses,
  HARNESS_DEFINITIONS,
  type DetectedHarness,
  type HarnessId,
} from './detect-harnesses';
import getSubcommand from '../../util/get-subcommand';
import { onboardVerify } from './verify';
import { collectPreflight, formatPreflight, type Preflight } from './preflight';
import { renderMission, renderMissionFromFile } from './instructions';
import { runSession } from './run-session';
import { OnboardProfile } from './profile';
import { reportProfile, reportProfileOnAbort } from './report-profile';

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

const COMMAND_CONFIG = {
  verify: ['verify'],
};

export default async function onboard(client: Client): Promise<number> {
  // Started before anything else so the total covers the whole command, not
  // just the part after the arguments turned out to be valid.
  const profile = new OnboardProfile();
  const flagsSpecification = getFlagsSpecification(onboardCommand.options);
  const telemetry = new OnboardTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  // Subcommands route before the main parse: `onboard verify` has its own
  // flags, which the session flow's specification would reject.
  {
    const permissive = parseArguments(
      client.argv.slice(2),
      {},
      { permissive: true }
    );
    const { subcommand, subcommandOriginal, args } = getSubcommand(
      permissive.args.slice(1),
      COMMAND_CONFIG
    );
    if (subcommand === 'verify') {
      telemetry.trackCliSubcommandVerify(subcommandOriginal);
      // The permissive parse consumed `--help`; hand it back.
      return onboardVerify(
        client,
        permissive.flags['--help'] ? [...args, '--help'] : args
      );
    }
  }

  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('onboard');
    output.print(help(onboardCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const pathArgument = parsedArgs.args[1];
  const harnessFlag = parsedArgs.flags['--harness'];
  const listHarnesses = parsedArgs.flags['--list-harnesses'] ?? false;
  const printPrompt = parsedArgs.flags['--print-prompt'] ?? false;
  const promptFile = parsedArgs.flags['--prompt'];
  const dryRun = parsedArgs.flags['--dry-run'] ?? false;
  const verbose = parsedArgs.flags['--verbose'] ?? false;
  const json = parsedArgs.flags['--json'] ?? false;
  const skipConfirmation = parsedArgs.flags['--yes'] ?? false;

  telemetry.trackCliArgumentPath(pathArgument);
  telemetry.trackCliOptionHarness(harnessFlag);
  telemetry.trackCliOptionPrompt(promptFile);
  telemetry.trackCliFlagListHarnesses(listHarnesses);
  telemetry.trackCliFlagPrintPrompt(printPrompt);
  telemetry.trackCliFlagDryRun(dryRun);
  telemetry.trackCliFlagVerbose(verbose);
  telemetry.trackCliFlagJson(json);
  telemetry.trackCliFlagYes(skipConfirmation);

  let exitCode = 1;
  const releaseAbortHandlers = reportProfileOnAbort(profile);
  try {
    exitCode = await runOnboard(client, {
      pathArgument,
      harnessFlag,
      listHarnesses,
      printPrompt,
      promptFile,
      dryRun,
      verbose,
      skipConfirmation,
      jsonFlags: parsedArgs.flags,
      profile,
    });
    return exitCode;
  } catch (error) {
    printError(error);
    return 1;
  } finally {
    releaseAbortHandlers();
    // Reported on every exit path, including a thrown one, since a run that
    // failed slowly is exactly the one worth having numbers for.
    await reportProfile(profile, exitCode);
  }
}

interface OnboardOptions {
  pathArgument?: string;
  harnessFlag?: string;
  listHarnesses: boolean;
  printPrompt: boolean;
  promptFile?: string;
  dryRun: boolean;
  verbose: boolean;
  skipConfirmation: boolean;
  jsonFlags: Record<string, unknown>;
  profile: OnboardProfile;
}

async function runOnboard(
  client: Client,
  options: OnboardOptions
): Promise<number> {
  const { profile } = options;

  const endDetect = profile.start('detect harnesses');
  const harnesses = await detectHarnesses();
  endDetect({ found: availableHarnesses(harnesses).map(h => h.id) });

  if (options.listHarnesses) {
    return printHarnessList(client, harnesses, options.jsonFlags);
  }

  const workspace = await resolveWorkspace(client, options.pathArgument);
  if (!workspace) {
    return 1;
  }
  profile.set('workspace', workspace);

  const endPreflight = profile.start('preflight');
  const preflight = await collectPreflight(client, workspace);
  endPreflight({
    linked: preflight.linked,
    frameworksDetected: preflight.intelligence?.frameworks.length ?? 0,
    servicesDetected: preflight.intelligence?.services.length ?? 0,
    intentFiles: preflight.intelligence?.intentFiles.length ?? 0,
  });

  // Composed as late as possible, so interactive decisions taken below (the
  // team, most importantly) land in the context as facts.
  const composePrompt = async (): Promise<string> => {
    const context = {
      workspace,
      vercelContext: formatPreflight(preflight),
    };
    const endPrompt = profile.start('compose instructions');
    let prompt = options.promptFile
      ? await renderMissionFromFile(
          resolve(client.cwd, options.promptFile),
          context
        )
      : renderMission(context);
    endPrompt();
    if (options.dryRun) {
      prompt += DRY_RUN_SUFFIX;
    }
    return prompt;
  };

  // `--print-prompt` works on a machine with no coding agent installed and
  // no terminal to prompt on, so it composes from the preflight as-is.
  if (options.printPrompt) {
    const prompt = await composePrompt();
    client.stdout.write(prompt.endsWith('\n') ? prompt : `${prompt}\n`);
    return 0;
  }

  const endSelect = profile.start('select harness');
  const harness = await selectHarness(client, harnesses, options);
  endSelect({ harness: harness?.id });
  if (!harness) {
    return 1;
  }
  profile.set('harness', harness.id);
  profile.set('harnessVersion', harness.version);

  if (!options.skipConfirmation) {
    const endConfirm = profile.start('waiting for confirmation');
    const decision = await confirmSession(client, harness, workspace, options);
    endConfirm({ decision });
    if (decision === 'declined') {
      output.log('Canceled.');
      return 0;
    }
    // `blocked` already reported why prompting was not possible.
    if (decision === 'blocked') {
      return 1;
    }
  }

  await pinTeam(client, preflight, options, profile);

  const prompt = await composePrompt();

  return runSession({
    client,
    harness,
    workspace,
    prompt,
    autoApprove: options.skipConfirmation,
    verbose: options.verbose,
    profile,
  });
}

/**
 * Decide the team the session acts in, before the agent starts.
 *
 * Which team to use is not agent judgment — it is account state this CLI can
 * enumerate and the user can answer with one keystroke, and a session that
 * guesses wrong provisions real resources in the wrong account. Pinned here,
 * the mission's instruction becomes "use this team", not "ask which team".
 *
 * A linked workspace needs no decision (the link carries the org), a single
 * team is pinned silently, and `--yes` or a non-TTY never prompts — an
 * explicit `--scope` (already reflected in the preflight) is honored as the
 * answer there.
 */
async function pinTeam(
  client: Client,
  preflight: Preflight,
  options: OnboardOptions,
  profile: OnboardProfile
): Promise<void> {
  if (preflight.linked) return;
  const teams = preflight.teams ?? [];
  if (teams.length === 0) return;

  if (teams.length === 1) {
    preflight.team = teams[0];
    preflight.teamPinned = true;
    return;
  }

  if (options.skipConfirmation || !client.stdin.isTTY) {
    if (preflight.team) {
      preflight.teamPinned = true;
    }
    return;
  }

  const endTeam = profile.start('waiting for your team');
  try {
    preflight.team = await client.input.select<string>({
      message: 'Which Vercel team should this session use?',
      choices: teams.map(team => ({ name: team, value: team })),
      ...(preflight.team && teams.includes(preflight.team)
        ? { default: preflight.team }
        : {}),
    });
    preflight.teamPinned = true;
  } finally {
    endTeam({ team: preflight.team });
  }
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
  options: OnboardOptions
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
  options: OnboardOptions
): Promise<SessionDecision> {
  output.print('\n');
  output.print(`  ${chalk.bold('Workspace')}  ${workspace}\n`);
  output.print(`  ${chalk.bold('Agent')}      ${harness.label}\n`);
  output.print('\n');

  output.print(
    options.dryRun
      ? `  Dry run: ${harness.label} inspects and plans. No changes, no deploys.\n\n`
      : `  ${harness.label} can modify files here, provision resources (asks first), and deploy previews.\n\n`
  );

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
