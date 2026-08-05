import chalk from 'chalk';
import { join, relative } from 'node:path';
import type Client from '../../util/client';
import {
  ApprovalWatcher,
  readLedger,
  recordSessionEvent,
  SHIP_SESSION_DIR_ENV,
  type ApprovalDecision,
  type ApprovalRequest,
  type LedgerEvent,
} from '../../util/ship-session';
import cmd from '../../util/output/cmd';
import output from '../../output-manager';
import type { DetectedHarness } from './detect-harnesses';
import {
  ensureHarnessPackages,
  getHarnessPackagesDir,
  type HarnessLoader,
} from './install-harness-packages';
import { HARNESS_SOURCE_ENV_VAR } from './local-harness-source';
import { installCliShim } from './cli-shim';
import { createSessionDir, finalizeSessionDir } from './session-storage';
import { FOLLOW_UPS } from './follow-ups';
import { ActivityIndicator, WORKING_PHRASES } from './activity';
import { answerAskUser, createAskUserTool, isAskUserTool } from './ask-user';
import {
  isHarnessBootstrapped,
  prepareHarnessBootstrap,
} from './prepare-bootstrap';
import { StreamRenderer } from './render-stream';
import { DeploymentTracker } from './deployments';
import { HandoffKeyListener } from './handoff-key';
import { NativeTuiSession, nativeTuiSupported } from './native-handoff';
import { printContinuation, resolveSessionId } from './session-continuation';
import { agentLabel, blankGutter, gutter, GUTTER_WIDTH } from './voice';
import { textWidth, wrapAnsi } from './wrap';
import type { ShipProfile } from './profile';

/**
 * The agent runtime. It also supplies the local workspace sandbox, which the
 * harness uses implicitly when no `sandbox` provider is passed.
 */
const HARNESS_CORE_PACKAGE = '@ai-sdk/harness';

export interface RunSessionOptions {
  client: Client;
  harness: DetectedHarness;
  /** Absolute path to the directory the agent is scoped to. */
  workspace: string;
  /** Fully rendered instructions handed to the agent as the first turn. */
  prompt: string;
  /** Skip approval prompts (`--yes`). */
  autoApprove: boolean;
  /** Print the agent's reasoning in full rather than collapsing it. */
  verbose: boolean;
  /** Collects where the wall time of this run goes. */
  profile: ShipProfile;
}

/**
 * Drive a coding-agent session against the user's own machine.
 *
 * Passing no `sandbox` provider is deliberate: the harness then runs locally,
 * rooted at `process.cwd()`, as the current user, so each agent finds the CLI,
 * credentials and configuration it already has installed.
 *
 * Orchestration lives here rather than in a direct CLI shell-out so that
 * approvals, tool calls and multi-step or multi-agent flows are surfaced through
 * one interface as this command grows.
 */
export async function runSession(options: RunSessionOptions): Promise<number> {
  // Opened here rather than around `driveSession`, so the span covers acquiring
  // the runtime as well as using it.
  const endSession = options.profile.start('session');
  try {
    return await startSession(options);
  } finally {
    endSession();
  }
}

async function startSession(options: RunSessionOptions): Promise<number> {
  const { client, harness, workspace, autoApprove, profile } = options;

  const endInstall = profile.start('install harness packages');
  const loader = await ensureHarnessPackages({
    client,
    harnessLabel: harness.label,
    autoApprove,
    specs: {
      core: HARNESS_CORE_PACKAGE,
      adapter: harness.adapterPackage,
    },
  });
  endInstall({ origin: loader?.origin });

  if (!loader) {
    return 1;
  }
  profile.set('runtimeOrigin', loader.origin);

  const endLoad = profile.start('load runtime');
  const runtime = await loadRuntime(loader, harness);
  endLoad();
  if (!runtime) {
    return 1;
  }

  quietSandboxWarning();

  // Everything below runs with the process rooted at the workspace. Split into
  // its own function so one `finally` restores the working directory, whichever
  // of the several exit paths is taken.
  const leaveWorkspace = enterWorkspace(workspace);
  try {
    return await driveSession({ ...options, runtime, loader });
  } finally {
    leaveWorkspace();
  }
}

async function driveSession(
  options: RunSessionOptions & {
    runtime: HarnessRuntime;
    loader: HarnessLoader;
  }
): Promise<number> {
  const { client, harness, workspace, prompt, runtime, loader, profile } =
    options;

  // Works around adapters that bootstrap with pnpm but ship no pnpm config.
  const endPrepare = profile.start('prepare bootstrap');
  await prepareHarnessBootstrap({ harnessId: harness.id, workspace });
  endPrepare();

  // Registered so the agent can ask structured questions the CLI renders as a
  // real selection. The instructions require it, so its absence is the case
  // that has to be corrected, not its presence.
  const tools = await createAskUserTool(loader);

  // No `sandbox`: the harness falls back to the local workspace, rooted at the
  // process working directory.
  const agent = new runtime.HarnessAgent({
    harness: runtime.createHarness(),
    ...(tools ? { tools } : {}),
  });

  printOpeningFrame(harness, workspace);

  // A bridge-backed adapter installs its bridge on first use, so a first run in
  // a project downloads and takes noticeably longer than later ones. Saying so
  // is the difference between waiting and assuming it has hung.
  const bootstrapped = await isHarnessBootstrapped({
    harnessId: harness.id,
    workspace,
  });
  if (!bootstrapped) {
    // Only the local build drives an agent executable the machine already has,
    // which is the difference between seconds and minutes, since the pinned
    // copy of the Claude Code binary alone is 236MB. Both builds report the
    // same version, so where the packages came from is the only signal, and
    // guessing from `binPath` alone would promise a quick install and then sit
    // there for minutes.
    const reused = loader.origin === 'local' && Boolean(harness.binPath);
    const duration = reused
      ? `Your installed ${harness.label} is reused, so this should be quick`
      : 'This is a large download and can take several minutes';
    vercelSays(
      `First run in this project: installing the ${harness.label} bridge into ` +
        `${chalk.dim('.harness-bootstrap/')}. ${duration}, and it only happens ` +
        `once per project.`
    );

    // The most likely reason someone sees the long install while holding a
    // perfectly good local executable: the packages in use cannot reuse it yet.
    if (!reused && harness.binPath) {
      vercelSays(
        chalk.dim(
          `You have ${harness.label} at ${harness.binPath}, but these harness ` +
            `packages cannot drive it. Set ${HARNESS_SOURCE_ENV_VAR} to a ` +
            `checkout of vercel/ai that can, and the install is far smaller.`
        )
      );
    }
  }

  const preparing = new ActivityIndicator();
  preparing.describe({
    actor: agentLabel(harness.id),
    sessionStartedAt: profile.startedAtMs,
  });
  preparing.start([
    bootstrapped
      ? `Preparing ${harness.label}`
      : `Installing the ${harness.label} bridge (first run)`,
  ]);

  // `createSession()` owns the sandbox lifecycle; every turn is issued against
  // it and it must be torn down even when a turn throws, or the bound workspace
  // and any adapter bridge process leak.
  // The single largest phase of a first run, and the one users read as a hang,
  // so it is measured on its own rather than folded into the session.
  // The one environment variable every process in the session inherits. The
  // approval gate and the ledger both live under the directory it names, so it
  // must be exported before the harness spawns anything. It sits next to the
  // harness's own run data in `.agent-runs/`, and the ledger stays after the
  // session ends — it is the record of what the session did.
  const storage = await createSessionDir(workspace);
  const sessionDir = storage.dir;
  const previousSessionDir = process.env[SHIP_SESSION_DIR_ENV];
  process.env[SHIP_SESSION_DIR_ENV] = sessionDir;

  // The agent's `vercel` must be this very CLI, or the gate and the ledger
  // silently do not exist (a stale global install shadows the build running
  // ship). The shim execs this process's own entrypoint.
  const previousPath = process.env.PATH;
  const shimDir = await installCliShim(sessionDir);
  if (shimDir) {
    process.env.PATH = previousPath ? `${shimDir}:${previousPath}` : shimDir;
  }

  const cleanupSessionDir = async (): Promise<void> => {
    if (previousSessionDir === undefined) {
      delete process.env[SHIP_SESSION_DIR_ENV];
    } else {
      process.env[SHIP_SESSION_DIR_ENV] = previousSessionDir;
    }
    if (shimDir) {
      if (previousPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = previousPath;
      }
    }
    await finalizeSessionDir(storage);
  };

  const endCreate = profile.start('start agent session', {
    bridgeInstalled: bootstrapped,
  });
  let session;
  try {
    session = await agent.createSession();
  } catch (err) {
    preparing.stop();
    reportSessionStartFailure(err, harness);
    await cleanupSessionDir();
    return 1;
  } finally {
    endCreate();
    preparing.stop();
  }

  const activity = new ActivityIndicator();
  // The total is the whole command, so it matches the total reported when the
  // run ends rather than starting again from where the session happened to.
  activity.describe({
    actor: agentLabel(harness.id),
    sessionStartedAt: profile.startedAtMs,
  });

  const renderer = new StreamRenderer(activity, profile);
  renderer.attribute(harness.id, { verbose: options.verbose });
  const deployments = new DeploymentTracker();
  renderer.trackDeployments(deployments);
  const startedAt = Date.now();

  // Whether the hand-off to the agent's own interface can keep its promises
  // (shim installed, POSIX, a TTY to hand over, a supported harness).
  const handoffAvailable = nativeTuiSupported(harness, {
    shimInstalled: Boolean(shimDir),
    isTTY: Boolean(client.stdin.isTTY),
  });

  // ctrl+t during a turn queues the hand-off for the turn's end. Armed only
  // while a turn streams; every prompt that needs the terminal suspends it.
  const nativeTui = new NativeTuiSession();
  const handoffKeys = new HandoffKeyListener({
    stdin: client.stdin,
    onRequest: () => {
      activity.pause();
      vercelSays(
        chalk.dim(
          `Got it — pausing ${harness.label} at its next stopping point.`
        )
      );
      activity.resume();
    },
  });

  // Gated commands (money, production, remote deletes) pause inside the CLI
  // and wait for the user's decision through this watcher. The gate is what
  // makes the mission's spending rules deterministic rather than advisory.
  // When the user has handed the terminal to the agent's own interface, the
  // wrapper freezes it around the prompt — the gate itself is identical in
  // both views. The key listener yields the terminal for the prompt either
  // way.
  const approvals = new ApprovalWatcher(sessionDir, request =>
    nativeTui.withTerminal(() =>
      handoffKeys.suspendDuring(() =>
        promptApproval({ client, request, activity, profile })
      )
    )
  );
  approvals.start();

  // Printed after each turn and again on teardown, deduplicated by content:
  // the user decides what to do next from the outcome, not from scrollback,
  // and an unchanged outcome is not repeated.
  let outcomePrinted = '';
  const reportOutcome = async (): Promise<void> => {
    const ledger = await readLedger(sessionDir);
    outcomePrinted = printSessionOutcome(
      ledger,
      deployments,
      profile,
      outcomePrinted
    );
  };

  try {
    // The agent routinely ends a turn by asking something — which team to use,
    // whether to approve a plan that costs money. Ending the process there would
    // throw away the session and force the whole discovery phase to be redone,
    // so keep taking turns until the user is done.
    let turnPrompt: string | undefined = tools
      ? prompt
      : prompt + NO_ASK_USER_SUFFIX;
    let turnNumber = 0;

    if (handoffAvailable) {
      vercelSays(
        chalk.dim(
          `Press ctrl+t at any time to pause the agent and continue in ` +
            `${harness.label} directly.`
        )
      );
    }

    while (true) {
      if (turnPrompt !== undefined) {
        turnNumber += 1;
        const endTurn = profile.start(`turn ${turnNumber}`);
        let exitCode: number;
        if (handoffAvailable) {
          handoffKeys.arm();
        }
        try {
          exitCode = await runTurn({
            agent,
            session,
            prompt: turnPrompt,
            renderer,
            activity,
            client,
            profile,
            agentName: agentLabel(harness.id),
            keys: handoffKeys,
          });
        } finally {
          handoffKeys.disarm();
          endTurn({ toolCalls: renderer.toolCallCount });
        }
        if (exitCode !== 0) {
          return exitCode;
        }

        // The outcome first, then the question: what the session produced is
        // what the user is deciding about.
        await reportOutcome();

        // A ctrl+t during the turn skips the menu: the user already chose.
        if (handoffKeys.consumePending()) {
          await runNativeTui({
            harness,
            nativeTui,
            workspace,
            startedAt,
            profile,
          });
          await reportOutcome();
        }
      }
      turnPrompt = undefined;

      const endReply = profile.start('waiting for your reply');
      const followUp = await chooseFollowUp({
        client,
        harnessLabel: harness.label,
        sessionDir,
        ...(handoffAvailable
          ? { nativeTuiLabel: `Continue in ${harness.label} directly` }
          : {}),
      });
      endReply({
        continued: followUp !== undefined,
        ...(followUp ? { followUp: followUp.id } : {}),
      });

      if (followUp === undefined) {
        return 0;
      }

      if (followUp.id === NATIVE_TUI_FOLLOW_UP) {
        await runNativeTui({
          harness,
          nativeTui,
          workspace,
          startedAt,
          profile,
        });
        // The ledger delta is the record of the TUI stint; print it before
        // asking what to do next, same as after an orchestrated turn.
        await reportOutcome();
        continue;
      }

      turnPrompt = followUp.prompt;
    }
  } catch (err) {
    activity.stop();
    renderer.flush();
    output.error(
      `${harness.label} session failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return 1;
  } finally {
    // A thrown turn must not leave the terminal in raw mode.
    handoffKeys.disarm();
    approvals.stop();

    const endDestroy = profile.start('stop agent session');
    try {
      await session.destroy();
    } catch (err) {
      output.debug(
        `ship: session teardown failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      endDestroy();
    }

    // Covers the exit paths that never reached a follow-up menu (a thrown
    // turn, a non-interactive run): the result still goes at the end, where it
    // is read. Deduplicated, so a normally ended session prints nothing twice.
    await reportOutcome();

    // Where the record lives, so a profile can be tied back to its ledger and
    // the user knows what survived the session.
    if (storage.persistent && (await readLedger(sessionDir)).length > 0) {
      const ledgerPath = join(sessionDir, 'ledger.ndjson');
      profile.set('ledger', ledgerPath);
      vercelSays(
        chalk.dim(`Session record: ${relative(workspace, ledgerPath)}`)
      );
    }
    await cleanupSessionDir();

    // Printed on every exit path, including a thrown turn. The conversation
    // holds the project inventory and any agreed plan, so the user must always
    // be told how to get back to it.
    await printContinuation({
      harnessId: harness.id,
      harnessLabel: harness.label,
      workspace,
      startedAt,
    });
  }
}

/**
 * State who is about to do the work, once, before any of it happens.
 *
 * The CLI contains no agent and no model. It composes instructions, registers
 * tools, and renders what comes back. Everything the session does is done by a
 * harness the developer already installed, running on their machine as them.
 * Saying so here is the only moment anyone reads it, and the rest of the
 * transcript is attributed line by line on the strength of it.
 */
export function vercelSays(text: string, continued = false): void {
  for (const [index, line] of wrapAnsi(
    text,
    textWidth(GUTTER_WIDTH),
    ''
  ).entries()) {
    const prefix =
      index === 0 && !continued ? gutter('vercel', 'vercel') : blankGutter();
    output.print(prefix + line + '\n');
  }
}

function printOpeningFrame(harness: DetectedHarness, workspace: string): void {
  const version = harness.version ? ` ${harness.version}` : '';

  output.print('\n');
  vercelSays(
    `Orchestrating ${chalk.bold(`${harness.label}${version}`)} on this machine.`
  );
  vercelSays(
    chalk.dim(
      'Vercel supplies the instructions and the tools. ' +
        `${harness.label} does the work, as you, in ${workspace}.`
    ),
    true
  );
  output.print('\n');
}

/**
 * Ask the user to approve a gated operation a `vercel` command is holding.
 *
 * The command shown is the exact invocation waiting inside the gate, not the
 * agent's paraphrase of it — what is approved is what runs. Enter approves:
 * the agent announced this step and the user is watching, so the common case
 * is one keystroke. A denial offers a steering line, relayed to the agent
 * verbatim, so "no" can be "no — use the existing database" instead of a dead
 * stop.
 */
async function promptApproval(options: {
  client: Client;
  request: ApprovalRequest;
  activity: ActivityIndicator;
  profile: ShipProfile;
}): Promise<ApprovalDecision> {
  const { client, request, activity, profile } = options;
  activity.pause();
  const endApproval = profile.start('waiting for your approval', {
    command: request.command,
    gate: request.gate,
  });
  try {
    output.print('\n');
    vercelSays(`${chalk.yellow('Approval needed')} — the agent wants to run:`);
    vercelSays(chalk.cyan(`vercel ${request.argv.join(' ')}`), true);
    vercelSays(chalk.dim(`This ${request.description}.`), true);

    if (!client.stdin.isTTY) {
      vercelSays(
        chalk.dim('No interactive terminal to ask on — denying.'),
        true
      );
      return { approved: false };
    }

    if (await client.input.confirm('Approve?', true)) {
      return { approved: true };
    }

    const instruction = (
      await client.input.text({
        message: 'Tell the agent what to do instead (optional):',
      })
    ).trim();
    return { approved: false, ...(instruction ? { instruction } : {}) };
  } catch {
    // A failed or interrupted prompt is a denial, never an open gate.
    return { approved: false };
  } finally {
    endApproval();
    activity.resume();
  }
}

/**
 * Report what the session actually did: deployments, and anything provisioned
 * that may be billed.
 *
 * Two sources, in order of trust. The ledger is written by the CLI itself at
 * the moment it performs an effect, from typed data. The output scraper reads
 * the transcript and can be fooled by URLs that were merely printed — so when
 * a ledger exists, a scraper-only URL is reported as unverified, and when it
 * does not (an older CLI on the agent's PATH), the scraper is all there is.
 */
function printSessionOutcome(
  ledger: LedgerEvent[],
  deployments: DeploymentTracker,
  profile: ShipProfile,
  previouslyPrinted: string
): string {
  interface Outcome {
    url: string;
    production: boolean;
    verified: boolean;
    inspectUrl?: string;
  }

  const outcomes = new Map<string, Outcome>();
  for (const event of ledger) {
    if (event.type === 'deployment' && typeof event.url === 'string') {
      outcomes.set(event.url, {
        url: event.url,
        production: event.target === 'production',
        verified: true,
      });
    }
  }

  const ledgerAware = ledger.length > 0;
  for (const observed of deployments.list()) {
    const existing = outcomes.get(observed.url);
    if (existing) {
      existing.inspectUrl ??= observed.inspectUrl;
      continue;
    }
    outcomes.set(observed.url, {
      url: observed.url,
      production: observed.production,
      inspectUrl: observed.inspectUrl,
      verified: !ledgerAware,
    });
  }

  const provisioned = ledger.filter(
    event => event.type === 'resource-provisioned'
  );

  // Nothing to report, or nothing new since the last print.
  const key = JSON.stringify([[...outcomes.values()], provisioned]);
  if (
    (outcomes.size === 0 && provisioned.length === 0) ||
    key === previouslyPrinted
  ) {
    return previouslyPrinted;
  }

  if (outcomes.size > 0) {
    profile.set('deployments', [...outcomes.keys()]);

    output.print('\n');
    vercelSays('Deployed:');
    for (const outcome of outcomes.values()) {
      const labels = [
        outcome.production ? chalk.yellow(' production') : '',
        outcome.verified ? '' : chalk.dim(' (unverified)'),
      ].join('');
      vercelSays(chalk.cyan(outcome.url) + labels, true);
      if (outcome.inspectUrl) {
        vercelSays(chalk.dim(outcome.inspectUrl), true);
      }
    }
  }

  if (provisioned.length > 0) {
    profile.set(
      'resourcesProvisioned',
      provisioned.map(event => `${event.integration}/${event.resource}`)
    );

    output.print('\n');
    vercelSays('Provisioned (may be billable):');
    for (const event of provisioned) {
      vercelSays(
        chalk.cyan(String(event.resource)) +
          chalk.dim(` — ${event.integration}`),
        true
      );
    }
  }

  return key;
}

/** Menu id for handing the terminal to the agent's own interface. */
const NATIVE_TUI_FOLLOW_UP = 'native-tui';

/**
 * Ask what to do next, offering the follow-ups the ledger supports.
 *
 * `undefined` ends the session. A follow-up returns its prompt, which runs as
 * the next turn of the same session — the agent keeps its context, and the
 * ledger it may need is still live. The native hand-off returns no prompt:
 * it is a host-side action, not a turn. "Something else" falls through to
 * the free-text reply this menu replaced.
 */
async function chooseFollowUp(options: {
  client: Client;
  harnessLabel: string;
  sessionDir: string;
  /** When set, offer to continue in the agent's own interface. */
  nativeTuiLabel?: string;
}): Promise<{ id: string; prompt?: string } | undefined> {
  const { client, harnessLabel, sessionDir, nativeTuiLabel } = options;

  if (!client.stdin.isTTY) {
    output.log(
      `${harnessLabel} finished its turn. Run ${cmd(
        'vercel ship'
      )} in an interactive terminal to continue the conversation here.`
    );
    return undefined;
  }

  const ledger = await readLedger(sessionDir);
  const available = FOLLOW_UPS.filter(followUp => followUp.available(ledger));

  const choice = await client.input.select<string>({
    message: 'What next?',
    choices: [
      { name: 'Done — end the session', value: 'done' },
      ...(nativeTuiLabel
        ? [{ name: nativeTuiLabel, value: NATIVE_TUI_FOLLOW_UP }]
        : []),
      ...available.map(followUp => ({
        name: followUp.label,
        value: followUp.id,
      })),
      { name: 'Give the agent another instruction', value: 'custom' },
    ],
  });

  if (choice === NATIVE_TUI_FOLLOW_UP) {
    return { id: NATIVE_TUI_FOLLOW_UP };
  }

  if (choice === 'custom') {
    const reply = await readReply(client, harnessLabel);
    return reply === undefined ? undefined : { id: 'custom', prompt: reply };
  }

  const followUp = available.find(candidate => candidate.id === choice);
  if (!followUp) {
    return undefined; // 'done', or anything unrecognized, ends the session.
  }

  output.print('\n');
  return { id: followUp.id, prompt: followUp.prompt(ledger) };
}

/**
 * Run the agent's own interface in the foreground until the user exits it.
 *
 * The stint is part of the same session in every sense that matters: the
 * TUI reopens the same conversation (resume by id when it can be resolved,
 * most-recent-in-cwd otherwise), inherits the session environment — so gates
 * and the ledger stay active — and the next orchestrated turn picks up
 * whatever the user and agent did natively. Entry and exit are journaled so
 * the record shows which effects happened under which interface.
 */
async function runNativeTui(options: {
  harness: DetectedHarness;
  nativeTui: NativeTuiSession;
  workspace: string;
  startedAt: number;
  profile: ShipProfile;
}): Promise<void> {
  const { harness, nativeTui, workspace, startedAt, profile } = options;

  const agentSessionId = await resolveSessionId({
    harnessId: harness.id,
    workspace,
    startedAt,
  });

  output.print('\n');
  vercelSays(
    `Handing the terminal to ${chalk.bold(harness.label)}. Exit it to come ` +
      `back here — approval gates and the session record stay active.`
  );
  output.print('\n');

  recordSessionEvent({
    type: 'handoff',
    direction: 'enter',
    interface: harness.id,
    ...(agentSessionId ? { agentSessionId } : {}),
  });

  const endHandoff = profile.start(`in ${harness.label} directly`, {
    ...(agentSessionId ? { agentSessionId } : {}),
  });
  let exitCode = 1;
  try {
    exitCode = await nativeTui.run(harness, agentSessionId);
  } finally {
    endHandoff({ exitCode });
    recordSessionEvent({ type: 'handoff', direction: 'exit', exitCode });
  }

  output.print('\n');
  vercelSays(`Back from ${harness.label}.`);
}

/**
 * Stream one turn to completion.
 */
async function runTurn(options: {
  agent: HarnessAgentInstance;
  session: HarnessSession;
  prompt: string;
  renderer: StreamRenderer;
  activity: ActivityIndicator;
  client: Client;
  profile: ShipProfile;
  /** Label for the harness, so a question is attributed like its prose. */
  agentName: string;
  /** Owns raw mode during the turn; prompts borrow the terminal through it. */
  keys?: HandoffKeyListener;
}): Promise<number> {
  const { agent, session, prompt, renderer, activity, client, profile, keys } =
    options;

  renderer.beginTurn();

  // Runs for the whole turn. The renderer pauses it around each write, so it is
  // visible during every gap (waiting on the model, waiting on a tool) and
  // invisible while output is flowing.
  activity.start(WORKING_PHRASES);

  // ctrl+t interrupts the turn at the next step boundary — the end of the
  // current model response and its tool batch, when nothing is mid-flight —
  // by aborting the in-flight turn, which the adapter propagates to the agent
  // exactly like its own interrupt key. Deliberately not a stop condition:
  // for a bridge-backed harness those suspend the host's consumption while
  // the agent keeps working, and a hand-off needs the agent actually paused.
  const abort = new AbortController();
  const handoff: HandoffInterrupt | undefined = keys && {
    aborted: false,
    onPart(type: string): void {
      if (this.aborted || !keys.hasPending || type !== 'finish-step') {
        return;
      }
      this.aborted = true;
      activity.pause();
      vercelSays(
        chalk.dim(`Pausing ${options.agentName} — the terminal is yours.`)
      );
      abort.abort();
    },
  };

  try {
    let result = await agent.stream({
      session,
      prompt,
      abortSignal: abort.signal,
    });
    await drain(result, renderer, handoff);
    if (handoff?.aborted) {
      swallow(result);
      return 0;
    }

    // A turn that called `askUser` is left unfinished, waiting for a result.
    // Answer it and continue the same turn, repeating in case the agent asks
    // again, so a question does not end the run.
    while (session.hasUnfinishedTurn()) {
      const pending = (await result.toolCalls).filter(call =>
        isAskUserTool(call.toolName)
      );
      if (pending.length === 0) {
        output.debug('ship: turn unfinished for a reason other than askUser');
        break;
      }

      // The user pressed ctrl+t and the agent stopped to ask something: the
      // question will be answered in the agent's own interface, not here.
      // Ending the turn through the ordinary tool-result machinery keeps the
      // session clean — no abort semantics while the turn waits on a tool.
      if (keys?.hasPending) {
        result = await agent.continueStream({
          session,
          toolResultContinuations: pending.map(call => ({
            toolCallId: call.toolCallId,
            output: { answer: HANDOFF_ASK_USER_ANSWER },
          })),
          abortSignal: abort.signal,
        });
        await drain(result, renderer, handoff);
        continue;
      }

      activity.pause();
      const endAsk = profile.start('waiting for your answer', {
        questions: pending.length,
      });
      const toolResultContinuations: HarnessToolResultContinuation[] = [];
      const collectAnswers = async (): Promise<void> => {
        for (const call of pending) {
          toolResultContinuations.push({
            toolCallId: call.toolCallId,
            output: await answerAskUser(client, call.input, options.agentName),
          });
        }
      };
      // The question needs the terminal; the hand-off key must let go of it.
      if (keys) {
        await keys.suspendDuring(collectAnswers);
      } else {
        await collectAnswers();
      }
      endAsk();
      activity.resume();

      result = await agent.continueStream({
        session,
        toolResultContinuations,
        abortSignal: abort.signal,
      });
      await drain(result, renderer, handoff);
      if (handoff?.aborted) {
        swallow(result);
        return 0;
      }
    }

    const finishReason = await result.finishReason;
    output.debug(`harness finish reason: ${finishReason}`);

    return finishReason === 'error' ? 1 : 0;
  } catch (err) {
    // The interrupt was ours; the stream ending abruptly is the expected
    // shape of it, not a failure.
    if (handoff?.aborted) {
      output.debug(
        `ship: turn aborted for hand-off: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return 0;
    }
    throw err;
  } finally {
    const elapsed = activity.stop();
    renderer.endTurn();
    output.debug(`ship: turn finished after ${elapsed}s`);
  }
}

/**
 * Ask the user for the next turn, or `undefined` to end the session.
 *
 * Deliberately not gated on `--yes`: that flag covers this command's own
 * prompts, and must never stand in for approving something the agent asked
 * about, such as provisioning a billable resource.
 */
async function readReply(
  client: Client,
  harnessLabel: string
): Promise<string | undefined> {
  if (!client.stdin.isTTY) {
    output.log(
      `${harnessLabel} finished its turn. Run ${cmd(
        'vercel ship'
      )} in an interactive terminal to continue the conversation here.`
    );
    return undefined;
  }

  const reply = await client.input.text({
    message: 'Reply (empty to end the session):',
  });

  const trimmed = reply.trim();
  if (!trimmed || EXIT_WORDS.has(trimmed.toLowerCase())) {
    return undefined;
  }

  output.print('\n');
  return trimmed;
}

/** Typed at the reply prompt to end the session. */
const EXIT_WORDS = new Set(['exit', 'quit', 'q', 'done', 'stop']);

/**
 * Withdraws the instruction to ask through `askUser` when the tool could not be
 * registered, which happens only if the harness tree cannot supply `ai` or
 * `zod`. Left as a correction to the mission rather than a variant of it, so
 * the common case reads as one unconditional rule.
 */
const NO_ASK_USER_SUFFIX = `

---

## Override: no \`askUser\` tool

The \`askUser\` tool is not available in this session, so the rule requiring it
does not apply. Ask in prose instead, put the question at the very end of your
turn, and stop there. The user's typed reply arrives as your next turn.
`;

/**
 * Interrupt state for a ctrl+t hand-off: watches the stream for a step
 * boundary and remembers that the abort that follows was deliberate.
 */
interface HandoffInterrupt {
  aborted: boolean;
  onPart(type: string): void;
}

/** Sent as the `askUser` result when the user is taking over in the TUI. */
const HANDOFF_ASK_USER_ANSWER =
  'The user is switching to your own interactive interface to continue ' +
  'there. End your turn immediately — no further actions, no summary. ' +
  'They saw your question and will answer it in your interface.';

async function drain(
  result: HarnessStreamResult,
  renderer: StreamRenderer,
  handoff?: HandoffInterrupt
): Promise<void> {
  for await (const part of result.fullStream) {
    // Our own interrupt must not render as a failure.
    if (handoff?.aborted && (part.type === 'abort' || part.type === 'error')) {
      continue;
    }
    renderer.render(part);
    handoff?.onPart(part.type);
  }
}

/**
 * Detach an aborted result's promises so their rejections are not treated as
 * unhandled once the turn has been deliberately cut short.
 */
function swallow(result: HarnessStreamResult): void {
  void Promise.resolve(result.finishReason).catch(() => undefined);
  void Promise.resolve(result.toolCalls).catch(() => undefined);
}

interface HarnessSession {
  destroy: () => Promise<unknown>;
  hasUnfinishedTurn: () => boolean;
}

interface HarnessToolCall {
  toolCallId: string;
  toolName: string;
  input?: unknown;
}

interface HarnessToolResultContinuation {
  toolCallId: string;
  output: unknown;
}

type HarnessAgentInstance = InstanceType<HarnessRuntime['HarnessAgent']>;

interface HarnessStreamResult {
  fullStream: AsyncIterable<{ type: string; [key: string]: unknown }>;
  finishReason: Promise<string>;
  toolCalls: Promise<HarnessToolCall[]>;
}

/**
 * Explain a failed session start.
 *
 * Running without a `sandbox` provider relies on the harness falling back to the
 * local workspace. A build without that fallback dereferences the missing
 * provider and throws a bare `TypeError` mentioning `createSession`, which tells
 * the user nothing. The published and unreleased builds currently share a version
 * number, so the package version cannot distinguish them — the error shape is the
 * only signal available.
 */
function reportSessionStartFailure(
  err: unknown,
  harness: DetectedHarness
): void {
  const message = err instanceof Error ? err.message : String(err);
  output.error(`Could not start a ${harness.label} session: ${message}`);

  // A native optional dependency that failed to download leaves the bridge
  // unrunnable. pnpm does not fail the install for it, so the symptom surfaces
  // here instead, and the underlying cause is almost always the registry.
  if (/native (package|binary)|optional/i.test(message)) {
    output.log(
      `This usually means a platform-native package could not be downloaded when ` +
        `the bridge was installed. Check that your npm registry is reachable and ` +
        `authenticated, then run ${cmd('vercel ship')} again. The incomplete ` +
        `install is detected and rebuilt automatically.`
    );
    return;
  }

  if (/undefined .*createSession|createSession.* undefined/.test(message)) {
    output.log(
      `The installed ${HARNESS_CORE_PACKAGE} does not support running without a ` +
        `sandbox provider, which ${cmd('vercel ship')} relies on to work against ` +
        `your local project. That capability is not in a published release yet.\n` +
        `Installed at: ${getHarnessPackagesDir()}\n\n` +
        `Until it is published, point ${HARNESS_SOURCE_ENV_VAR} at a checkout of ` +
        `vercel/ai with the packages built:\n` +
        `    pnpm --filter ${HARNESS_CORE_PACKAGE} build\n` +
        `    ${HARNESS_SOURCE_ENV_VAR}=/path/to/ai ${cmd('vercel ship')}`
    );
  }
}

/**
 * Point the process at the workspace and hand back a restore function.
 *
 * The local workspace roots itself at `process.cwd()`, while `vercel ship`
 * accepts a path argument and honours the global `--cwd`, neither of which
 * changes the process directory. Without this the agent would run against
 * whatever directory the CLI happened to be launched from.
 */
function enterWorkspace(workspace: string): () => void {
  const previous = process.cwd();
  if (previous === workspace) {
    return () => {};
  }
  process.chdir(workspace);
  return () => {
    try {
      process.chdir(previous);
    } catch (err) {
      output.debug(
        `ship: could not restore the working directory: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };
}

/**
 * Replace the SDK's "no sandbox, no isolation" warning with a debug line.
 *
 * The warning is correct, but `vercel ship` has already told the user, in more
 * specific terms and before they consented, that the agent will read and modify
 * files in this directory. Printing it again immediately after they agreed reads
 * as a malfunction rather than a caution.
 */
function quietSandboxWarning(): void {
  const globals = globalThis as {
    AI_SDK_LOG_WARNINGS?: unknown;
  };
  if (globals.AI_SDK_LOG_WARNINGS !== undefined) {
    return;
  }
  globals.AI_SDK_LOG_WARNINGS = ({
    warnings,
  }: {
    warnings: { message?: string }[];
  }) => {
    for (const warning of warnings ?? []) {
      output.debug(`harness: ${warning?.message ?? 'warning'}`);
    }
  };
}

interface HarnessRuntime {
  HarnessAgent: new (
    config: unknown
  ) => {
    createSession: () => Promise<HarnessSession>;
    stream: (options: {
      session: HarnessSession;
      prompt: string;
      abortSignal?: AbortSignal;
    }) => Promise<HarnessStreamResult>;
    continueStream: (options: {
      session: HarnessSession;
      toolResultContinuations: HarnessToolResultContinuation[];
      abortSignal?: AbortSignal;
    }) => Promise<HarnessStreamResult>;
  };
  createHarness: () => unknown;
}

async function loadRuntime(
  loader: HarnessLoader,
  harness: DetectedHarness
): Promise<HarnessRuntime | undefined> {
  try {
    const [core, adapter] = await Promise.all([
      loader.loadCore(),
      loader.loadAdapter(),
    ]);

    const HarnessAgent = core.HarnessAgent as HarnessRuntime['HarnessAgent'];
    const createHarness = findHarnessFactory(adapter);

    if (!HarnessAgent) {
      output.error(
        `"${HARNESS_CORE_PACKAGE}/agent" does not export "HarnessAgent".`
      );
      return undefined;
    }
    if (!createHarness) {
      output.error(
        `"${harness.adapterPackage}" does not export a recognizable harness factory.`
      );
      return undefined;
    }

    return { HarnessAgent, createHarness };
  } catch (err) {
    output.error(
      `Failed to load the ${harness.label} runtime: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return undefined;
  }
}

/**
 * Adapters export a `create<Name>()` factory whose exact name varies by package
 * (`createClaudeCode`, `createCodex`, ...). Resolve it structurally so a new
 * adapter does not require a hardcoded mapping.
 */
function findHarnessFactory(
  module: Record<string, unknown>
): (() => unknown) | undefined {
  for (const [name, value] of Object.entries(module)) {
    if (name.startsWith('create') && typeof value === 'function') {
      return value as () => unknown;
    }
  }
  return undefined;
}
