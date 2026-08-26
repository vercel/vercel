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
import { findResumableSession, type ResumableSession } from './session-storage';
import { readLedger } from '../../util/onboard-session';
import { OnboardProfile } from './profile';
import {
  reportProfile,
  reportProfileOnAbort,
  type AbortHandlers,
} from './report-profile';

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
  const resume = parsedArgs.flags['--resume'] ?? false;
  const verbose = parsedArgs.flags['--verbose'] ?? false;
  const json = parsedArgs.flags['--json'] ?? false;
  const skipConfirmation = parsedArgs.flags['--yes'] ?? false;

  telemetry.trackCliArgumentPath(pathArgument);
  telemetry.trackCliOptionHarness(harnessFlag);
  telemetry.trackCliOptionPrompt(promptFile);
  telemetry.trackCliFlagListHarnesses(listHarnesses);
  telemetry.trackCliFlagPrintPrompt(printPrompt);
  telemetry.trackCliFlagDryRun(dryRun);
  telemetry.trackCliFlagResume(resume);
  telemetry.trackCliFlagVerbose(verbose);
  telemetry.trackCliFlagJson(json);
  telemetry.trackCliFlagYes(skipConfirmation);

  let exitCode = 1;
  const abortHandlers = reportProfileOnAbort(profile);
  try {
    exitCode = await runOnboard(client, {
      abortHandlers,
      pathArgument,
      harnessFlag,
      listHarnesses,
      printPrompt,
      promptFile,
      dryRun,
      resume,
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
    abortHandlers.release();
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
  resume: boolean;
  verbose: boolean;
  skipConfirmation: boolean;
  jsonFlags: Record<string, unknown>;
  profile: OnboardProfile;
  abortHandlers: AbortHandlers;
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

  // A resume needs none of what follows — no preflight, no composed mission,
  // no team decision. All of that is already in the conversation being picked
  // back up, and recomputing it would both cost seconds and contradict it.
  if (options.resume) {
    return resumeSession(client, { workspace, harnesses, options });
  }

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
    abortHandlers: options.abortHandlers,
  });
}

/**
 * `--resume`: carry on the most recent session in this directory.
 *
 * Resuming is not restarting with context. The harness reopens the agent's own
 * conversation by id, and the ledger continues in the same file, so the second
 * half of a run is accountable in the same record as the first. What the user
 * supplies is only the next instruction.
 *
 * The harness is taken from the record rather than re-selected: a conversation
 * belongs to the agent that had it, and resuming it into a different one would
 * silently start a new session wearing the old session's directory.
 */
async function resumeSession(
  client: Client,
  context: {
    workspace: string;
    harnesses: DetectedHarness[];
    options: OnboardOptions;
  }
): Promise<number> {
  const { workspace, harnesses, options } = context;
  const { profile } = options;

  const endFind = profile.start('find resumable session');
  const resume = await findResumableSession(workspace);
  endFind({ found: Boolean(resume) });

  if (!resume) {
    output.error(
      `No previous session to resume in ${workspace}.\n` +
        `  Run ${cmd('vercel onboard')} to start one.`
    );
    return 1;
  }

  const harness = harnesses.find(entry => entry.id === resume.record.harnessId);
  if (!harness || harness.status === 'missing') {
    output.error(
      `That session ran on ${resume.record.harnessId}, which is not available ` +
        `now. Install it, or run ${cmd('vercel onboard')} to start fresh.`
    );
    return 1;
  }
  if (options.harnessFlag && options.harnessFlag !== harness.id) {
    output.error(
      `That session ran on ${harness.id}; --harness ${options.harnessFlag} ` +
        `would start a new conversation. Omit --harness to resume it.`
    );
    return 1;
  }
  profile.set('harness', harness.id);
  profile.set('harnessVersion', harness.version);
  profile.set('resumedFrom', resume.dir);

  await describeResumedSession(resume, harness);

  const instruction = await readResumeInstruction(client, harness, options);
  if (instruction === undefined) {
    output.log('Canceled.');
    return 0;
  }

  return runSession({
    client,
    harness,
    workspace,
    prompt: instruction,
    autoApprove: options.skipConfirmation,
    verbose: options.verbose,
    profile,
    abortHandlers: options.abortHandlers,
    resume,
  });
}

/**
 * Say what the session being resumed already did, from its ledger.
 *
 * The user is about to hand the agent another instruction, and the useful
 * context for that is what already exists on their account — not a transcript
 * they have scrolled past or a session they started yesterday.
 */
async function describeResumedSession(
  resume: ResumableSession,
  harness: DetectedHarness
): Promise<void> {
  const when = new Date(resume.record.updatedAt);
  const ledger = await readLedger(resume.dir);

  const counts = new Map<string, number>();
  for (const event of ledger) {
    if (event.type === 'command' || event.type === 'approval') continue;
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  }

  output.print('\n');
  output.log(
    `Resuming the ${harness.label} session from ${when.toLocaleString()}.`
  );
  if (counts.size > 0) {
    const summary = [...counts]
      .map(([type, count]) => `${count} ${type.replace(/-/g, ' ')}`)
      .join(', ');
    output.log(chalk.dim(`  That session recorded: ${summary}.`));
  }
  output.print('\n');
}

/**
 * The instruction the resumed conversation opens on.
 *
 * A resume with nothing to say is a resume that wastes a turn, so an empty
 * line cancels rather than nudging the agent to invent work. Non-interactive
 * runs get a neutral continuation instead of a prompt they cannot answer.
 */
async function readResumeInstruction(
  client: Client,
  harness: DetectedHarness,
  options: OnboardOptions
): Promise<string | undefined> {
  if (!client.stdin.isTTY || options.skipConfirmation) {
    return RESUME_CONTINUE_PROMPT;
  }

  const endWait = options.profile.start('waiting for your instruction');
  try {
    const reply = await client.input.text({
      message: `What should ${harness.label} do next? (empty cancels)`,
    });
    const trimmed = reply.trim();
    return trimmed ? trimmed : undefined;
  } catch {
    return undefined;
  } finally {
    endWait();
  }
}

/** Sent when a resume cannot ask: pick the thread up without re-planning. */
const RESUME_CONTINUE_PROMPT =
  'Continue from where you left off. Re-read your plan and the current state ' +
  'of the project before acting, and do not repeat work that is already done.';

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
