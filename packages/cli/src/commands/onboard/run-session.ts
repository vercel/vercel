import chalk from 'chalk';
import { join, relative } from 'node:path';
import type Client from '../../util/client';
import {
  ApprovalWatcher,
  readLedger,
  recordSessionEvent,
  ONBOARD_SESSION_DIR_ENV,
  type ApprovalDecision,
  type ApprovalRequest,
  type LedgerEvent,
} from '../../util/onboard-session';
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
import {
  createSessionDir,
  finalizeSessionDir,
  openSessionDir,
  writeSessionRecord,
  buildResumeState,
  type ResumableSession,
} from './session-storage';
import { FOLLOW_UPS } from './follow-ups';
import { ActivityIndicator, WORKING_PHRASES } from './activity';
import { answerAskUser, createAskUserTool, isAskUserTool } from './ask-user';
import {
  isHarnessBootstrapped,
  prepareHarnessBootstrap,
} from './prepare-bootstrap';
import { StreamRenderer } from './render-stream';
import { DeploymentTracker } from './deployments';
import {
  createHandoffInterrupt,
  HandoffKeyListener,
  type HandoffInterrupt,
} from './handoff-key';
import { NativeTuiSession, nativeTuiSupported } from './native-handoff';
import { printStint, summarizeStint, type StintMessage } from './replay-stint';
import {
  printContinuation,
  resolveSessionId,
  waitForTranscriptSettle,
} from './session-continuation';
import { buildSessionReport } from './session-report';
import { agentLabel, blankGutter, gutter, GUTTER_WIDTH } from './voice';
import { textWidth, truncateAnsi, wrapAnsi } from './wrap';
import type { OnboardProfile } from './profile';
import type { AbortHandlers } from './report-profile';

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
  profile: OnboardProfile;
  /**
   * Signal handlers owning the abort path, so session teardown can be hooked
   * onto it. Optional: callers that do not install handlers simply lose the
   * guarantee, they do not lose the session.
   */
  abortHandlers?: AbortHandlers;
  /**
   * A previous session to carry on, found by `--resume`. Its directory is
   * reopened so the ledger continues in place, and its agent-side id is
   * handed to the harness so the conversation continues too.
   */
  resume?: ResumableSession;
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
  const {
    client,
    harness,
    workspace,
    prompt,
    runtime,
    loader,
    profile,
    abortHandlers,
    resume,
    autoApprove,
  } = options;

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
    vercelSays(
      `First run: installing the ${harness.label} bridge into ` +
        `${chalk.dim('.harness-bootstrap/')} (once per project; ` +
        `${reused ? 'quick — reuses your install' : 'large download, can take minutes'}).`
    );

    // The most likely reason someone sees the long install while holding a
    // perfectly good local executable: the packages in use cannot reuse it yet.
    if (!reused && harness.binPath) {
      vercelSays(
        chalk.dim(
          `These packages cannot drive your ${harness.label} at ` +
            `${harness.binPath}. Set ${HARNESS_SOURCE_ENV_VAR} to a vercel/ai ` +
            `checkout for a much smaller install.`
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
  const storage = resume
    ? await openSessionDir(resume.dir)
    : await createSessionDir(workspace);
  const sessionDir = storage.dir;
  const previousSessionDir = process.env[ONBOARD_SESSION_DIR_ENV];
  process.env[ONBOARD_SESSION_DIR_ENV] = sessionDir;

  // The agent's `vercel` must be this very CLI, or the gate and the ledger
  // silently do not exist (a stale global install shadows the build running
  // onboard). The shim execs this process's own entrypoint.
  const previousPath = process.env.PATH;
  const shimDir = await installCliShim(sessionDir);
  if (shimDir) {
    process.env.PATH = previousPath ? `${shimDir}:${previousPath}` : shimDir;
  }

  const cleanupSessionDir = async (): Promise<void> => {
    if (previousSessionDir === undefined) {
      delete process.env[ONBOARD_SESSION_DIR_ENV];
    } else {
      process.env[ONBOARD_SESSION_DIR_ENV] = previousSessionDir;
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

  // The harness bridge and the agent CLI beneath it are separate processes
  // that outlive this one unless they are stopped. `process.exit()` in the
  // signal handler skips every `finally` below, so the abort path needs its
  // own route to the same teardown — without it, Ctrl-C strands the bridge.
  /**
   * Update the record with the agent's own conversation id.
   *
   * Resolved rather than remembered: the id lives in the agent's transcript
   * store and only appears once a turn has been written, so it cannot be
   * captured at session start. Called on both exit paths, because a run that
   * was interrupted is exactly the one someone wants to resume.
   *
   * A resumed run keeps the id it resumed and never adopts a newly resolved
   * one. Resolution can only answer "the newest transcript for this
   * workspace", so if a resume silently failed and opened a fresh thread,
   * adopting that answer would replace the pointer to the real conversation
   * with a pointer to the empty one — and every later resume would land
   * there, irrecoverably. When the resume worked, the two ids are identical
   * and keeping the old one costs nothing.
   */
  const recordResumePoint = async (): Promise<void> => {
    const agentSessionId =
      resume?.record.agentSessionId ??
      (await resolveSessionId({
        harnessId: harness.id,
        workspace,
        startedAt,
      }));
    await writeSessionRecord(sessionDir, {
      harnessId: harness.id,
      ...(session?.sessionId ? { harnessSessionId: session.sessionId } : {}),
      ...(agentSessionId ? { agentSessionId } : {}),
      workspace,
      startedAt: resume?.record.startedAt ?? startedAt,
      updatedAt: Date.now(),
    });
  };

  let teardownRan = false;
  const stopSession = async (): Promise<void> => {
    if (teardownRan) return;
    teardownRan = true;
    // Recorded before the destroy, so a signalled run stays resumable: the
    // agent's transcript is already on disk by the time a turn has streamed.
    await recordResumePoint();
    try {
      await session?.destroy();
    } catch (err) {
      output.debug(
        `onboard: session teardown failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    await cleanupSessionDir();
  };

  const endCreate = profile.start('start agent session', {
    bridgeInstalled: bootstrapped,
  });
  let session: HarnessSession;
  try {
    // Resuming needs a lifecycle state, not just a session id: the id only
    // names the run directory, while `resumeFrom` is what puts the adapter on
    // its resume path at all. `data.claudeSessionId` then names the exact
    // conversation, so the agent reopens the thread this record describes
    // rather than whichever one is newest in the directory.
    session = await agent.createSession(
      resume
        ? {
            ...(resume.record.harnessSessionId
              ? { sessionId: resume.record.harnessSessionId }
              : {}),
            resumeFrom: buildResumeState(harness.id, resume.record),
          }
        : undefined
    );
    abortHandlers?.onAbort(stopSession);
    // Written as soon as there is an id to write, so a session interrupted
    // one second later is still resumable.
    await writeSessionRecord(sessionDir, {
      harnessId: harness.id,
      ...(session.sessionId ? { harnessSessionId: session.sessionId } : {}),
      workspace,
      startedAt: resume?.record.startedAt ?? Date.now(),
      updatedAt: Date.now(),
    });
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

  // esc during a turn queues a steering pause, ctrl+t a native hand-off,
  // both for the turn's next safe point. Armed only while a turn streams;
  // every prompt that needs the terminal suspends it.
  const nativeTui = new NativeTuiSession();
  const handoffKeys = new HandoffKeyListener({
    stdin: client.stdin,
    acceptHandoff: handoffAvailable,
    onRequest: kind => {
      activity.pause();
      vercelSays(
        chalk.dim(
          kind === 'steer'
            ? 'Pausing at the next safe point…'
            : `Pausing at the next safe point, then switching to ${harness.label}…`
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
        promptApproval({ client, request, activity, profile, autoApprove })
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

    if (client.stdin.isTTY) {
      vercelSays(
        chalk.dim(
          handoffAvailable
            ? `esc interrupts and steers · ctrl+t switches to ${harness.label}`
            : 'esc interrupts and steers'
        )
      );
    }

    while (true) {
      if (turnPrompt !== undefined) {
        turnNumber += 1;
        const endTurn = profile.start(`turn ${turnNumber}`);
        let exitCode: number;
        handoffKeys.arm();
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
        } catch (err) {
          // A failed turn must not cost the session: the conversation — the
          // inventory, the plan — is the expensive part, and the menu below
          // offers ways to carry on (retry with an instruction, continue in
          // the agent's own interface, or end deliberately).
          activity.stop();
          renderer.flush();
          output.error(
            `${harness.label} turn failed: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
          exitCode = 1;
        } finally {
          handoffKeys.disarm();
          endTurn({ toolCalls: renderer.toolCallCount });
        }
        if (exitCode !== 0 && !client.stdin.isTTY) {
          return exitCode;
        }

        // The outcome first, then the question: what the session produced is
        // what the user is deciding about.
        await reportOutcome();

        // An interrupt key during the turn skips the menu: the user already
        // chose what happens next.
        const interrupt = handoffKeys.consumePending();
        if (interrupt === 'handoff') {
          await runNativeTui({
            harness,
            nativeTui,
            session,
            workspace,
            startedAt,
            profile,
          });
          await reportOutcome();
          // This hand-off followed an interrupt — the very case the recycle
          // exists for (see the menu path); the two paths must not differ.
          session =
            (await recycleSession({ agent, session, profile })) ?? session;
        } else if (interrupt === 'steer') {
          const instruction = await readSteeringInstruction(client, profile);
          if (instruction !== undefined) {
            // Same rationale as the hand-off path: the bridge process that
            // performed the interrupt has been observed poisoning its next
            // turn, so the steering instruction runs on a fresh runtime.
            session =
              (await recycleSession({ agent, session, profile })) ?? session;
            turnPrompt = instruction;
            continue;
          }
          // An empty line means they changed their mind — fall through to
          // the menu, which offers everything steering does and more.
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
          session,
          workspace,
          startedAt,
          profile,
        });
        // The ledger delta is the record of the TUI stint; print it before
        // asking what to do next, same as after an orchestrated turn.
        await reportOutcome();
        // The bridge process that performed the interrupt has been observed
        // poisoning its next turn (an [ede_diagnostic] failure that a fresh
        // process on the same conversation does not reproduce), so the
        // session is recycled: stop → resume state → fresh bridge, whose
        // rerun path continues the same conversation.
        session =
          (await recycleSession({ agent, session, profile })) ?? session;
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
        `onboard: session teardown failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      teardownRan = true;
      endDestroy();
    }

    // The resume point, refreshed from the transcript this run just extended.
    await recordResumePoint();

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
function vercelSays(text: string, continued = false): void {
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
    `Orchestrating ${chalk.bold(`${harness.label}${version}`)} — ` +
      `runs as you, in ${workspace}.`
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
  profile: OnboardProfile;
  autoApprove: boolean;
}): Promise<ApprovalDecision> {
  const { client, request, activity, profile, autoApprove } = options;
  activity.pause();
  const endApproval = profile.start('waiting for your approval', {
    command: request.command,
    gate: request.gate,
  });
  try {
    output.print('\n');
    vercelSays(`${chalk.yellow('Approval needed')}:`);
    vercelSays(chalk.cyan(`vercel ${request.argv.join(' ')}`), true);
    vercelSays(chalk.dim(`${request.description}.`), true);

    // `--yes` answers here, in the process that owns the question, rather than
    // by weakening the gate in the command that asked it. Every gate still
    // fires, still prints what it is about to allow, and still journals — an
    // unattended run stays as auditable as a watched one, which is the whole
    // point of using it for evals. Printed rather than silent, because the
    // transcript is the only record an unattended run leaves behind.
    if (autoApprove) {
      vercelSays(
        chalk.dim('Approved automatically by --yes; no one was asked.'),
        true
      );
      output.print('\n');
      return { approved: true, auto: true };
    }

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
 * Report what the session actually did, as one table: each thing that now
 * exists (or was removed), the status the machine observed, and what it
 * costs — with the monthly estimate summed from the billing plans the
 * platform itself selected at provisioning time. Built by
 * `buildSessionReport` from the ledger first and the output scraper second;
 * nothing here comes from the model's recall.
 */
function printSessionOutcome(
  ledger: LedgerEvent[],
  deployments: DeploymentTracker,
  profile: OnboardProfile,
  previouslyPrinted: string
): string {
  const report = buildSessionReport(ledger, deployments.list());

  // Nothing to report, or nothing new since the last print.
  const key = JSON.stringify(report.rows);
  if (report.rows.length === 0 || key === previouslyPrinted) {
    return previouslyPrinted;
  }

  if (report.deployments.length > 0) {
    profile.set('deployments', report.deployments);
  }
  if (report.resourcesProvisioned.length > 0) {
    profile.set('resourcesProvisioned', report.resourcesProvisioned);
  }

  // Column widths from content, the resource column absorbing whatever the
  // terminal has left; a URL is cut rather than wrapped, because a wrapped
  // table is not a table.
  const statusWidth = Math.max(
    'status'.length,
    ...report.rows.map(row => row.status.length)
  );
  const costWidth = Math.max(
    'cost'.length,
    ...report.rows.map(row => row.cost.length)
  );
  const available = textWidth(GUTTER_WIDTH);
  const resourceWidth = Math.max(
    16,
    Math.min(
      Math.max(...report.rows.map(row => row.resource.length)),
      available - statusWidth - costWidth - 4
    )
  );

  const cell = (text: string, width: number): string =>
    truncateAnsi(text, width).padEnd(width);

  output.print('\n');
  vercelSays('Session result:');
  vercelSays(
    chalk.dim(
      `${cell('resource', resourceWidth)}  ${cell('status', statusWidth)}  cost`
    ),
    true
  );
  for (const row of report.rows) {
    const dimmed = row.unverified || row.kind === 'alias';
    const resource = dimmed
      ? chalk.dim(cell(row.resource, resourceWidth))
      : chalk.cyan(cell(row.resource, resourceWidth));
    const status = row.production
      ? chalk.yellow(cell(row.status, statusWidth))
      : dimmed
        ? chalk.dim(cell(row.status, statusWidth))
        : cell(row.status, statusWidth);
    const cost = row.cost === 'usage' ? chalk.dim(row.cost) : row.cost;
    vercelSays(`${resource}  ${status}  ${cost}`, true);
    for (const detail of row.details ?? []) {
      vercelSays(chalk.dim(`  ${truncateAnsi(detail, available - 2)}`), true);
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
      `${harnessLabel} finished. Re-run ${cmd(
        'vercel onboard'
      )} in an interactive terminal to continue.`
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
  session: HarnessSession;
  workspace: string;
  startedAt: number;
  profile: OnboardProfile;
}): Promise<void> {
  const { harness, nativeTui, session, workspace, startedAt, profile } =
    options;

  // A hand-off can follow a graceful mid-turn interrupt whose transcript
  // writes are still flushing; resume only once the agent's store is quiet,
  // or the TUI would open on a conversation missing its latest work.
  await waitForTranscriptSettle({ harnessId: harness.id, workspace });

  // Where the conversation stands before the stint, so what happened during
  // it can be read back — through the harness, which asks the adapter, which
  // owns its runtime's store. No transcript parsing lives on this side.
  const historyBefore = await readHistoryQuietly(session);

  const agentSessionId = await resolveSessionId({
    harnessId: harness.id,
    workspace,
    startedAt,
  });

  output.print('\n');
  vercelSays(
    `Switching to ${chalk.bold(harness.label)} — exit it to return. ` +
      chalk.dim('Approval gates stay active.')
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

  // Replay what the stint contained, so onboard's transcript stays one
  // continuous story: the missing chunk comes from the runtime's own store,
  // not from scraping or from the model's recall.
  await waitForTranscriptSettle({ harnessId: harness.id, workspace });
  const delta = await readHistoryQuietly(session, historyBefore?.cursor);
  if (delta && delta.messages.length > 0) {
    output.print('\n');
    printStint(delta.messages, { harnessId: harness.id });
    recordSessionEvent({
      type: 'handoff-summary',
      ...summarizeStint(delta.messages),
    });
  }
}

/**
 * `readHistory` where the runtime supports it, `undefined` where it does not
 * — and never an error either way: the replay is an observer, and a session
 * without it is merely a session with a quieter log.
 */
async function readHistoryQuietly(
  session: HarnessSession,
  since?: string
): Promise<{ messages: StintMessage[]; cursor: string } | undefined> {
  if (typeof session.readHistory !== 'function') {
    return undefined;
  }
  try {
    return await session.readHistory(since ? { since } : undefined);
  } catch (err) {
    output.debug(
      `onboard: could not read the agent's history: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return undefined;
  }
}

/**
 * Replace the live harness session with a fresh runtime resuming the same
 * conversation: stop → resume state → `createSession({ sessionId,
 * resumeFrom })`, whose rerun path continues the agent's own thread.
 *
 * Exists because a bridge process that has performed a mid-turn interrupt
 * has been observed failing its next turn with a diagnostic that a fresh
 * process on the same conversation does not reproduce. Best effort:
 * `undefined` keeps the current session (an older runtime without `stop`,
 * or a stop that failed before detaching — and if the stop landed but the
 * recreate failed, the next turn's failure lands in the menu, not on the
 * floor).
 */
async function recycleSession(options: {
  agent: HarnessAgentInstance;
  session: HarnessSession;
  profile: OnboardProfile;
}): Promise<HarnessSession | undefined> {
  const { agent, session, profile } = options;
  if (typeof session.stop !== 'function' || !session.sessionId) {
    return undefined;
  }

  const endRecycle = profile.start('recycle agent session');
  try {
    const resumeFrom = await session.stop();
    return await agent.createSession({
      sessionId: session.sessionId,
      resumeFrom,
    });
  } catch (err) {
    output.debug(
      `onboard: could not recycle the session: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return undefined;
  } finally {
    endRecycle();
  }
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
  profile: OnboardProfile;
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

  // ctrl+t interrupts the turn by aborting it, which the adapter propagates
  // to the agent exactly like its own interrupt key (the bridge prefers the
  // SDK's graceful interrupt, so the cut-short turn is persisted). When the
  // interrupt fires is `createHandoffInterrupt`'s decision: immediately,
  // except while a tool call is running. Deliberately not a stop condition:
  // for a bridge-backed harness those suspend the host's consumption while
  // the agent keeps working, and a hand-off needs the agent actually paused.
  const abort = new AbortController();
  const handoff: HandoffInterrupt | undefined =
    keys &&
    createHandoffInterrupt({
      keys,
      onAbort: () => {
        // Emit anything the renderer is still holding (a collapsed "thought
        // for Ns" line, a partial paragraph) before announcing the pause, or
        // it prints after the announcement and reads as the agent talking
        // over the hand-off.
        renderer.flush();
        activity.pause();
        vercelSays(
          chalk.dim(`Pausing ${options.agentName} — the terminal is yours.`)
        );
        abort.abort();
      },
    });

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
        output.debug(
          'onboard: turn unfinished for a reason other than askUser'
        );
        break;
      }

      // The user pressed an interrupt key and the agent stopped to ask
      // something: the question is not answered here — it will be answered
      // in the agent's own interface (hand-off), or overtaken by the
      // steering instruction about to arrive. Ending the turn through the
      // ordinary tool-result machinery keeps the session clean — no abort
      // semantics while the turn waits on a tool.
      if (keys?.hasPending) {
        const answer =
          keys.pendingKind === 'steer'
            ? STEER_ASK_USER_ANSWER
            : HANDOFF_ASK_USER_ANSWER;
        result = await agent.continueStream({
          session,
          toolResultContinuations: pending.map(call => ({
            toolCallId: call.toolCallId,
            output: { answer },
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
        `onboard: turn aborted for hand-off: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return 0;
    }
    throw err;
  } finally {
    const elapsed = activity.stop();
    renderer.endTurn();
    output.debug(`onboard: turn finished after ${elapsed}s`);
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
      `${harnessLabel} finished. Re-run ${cmd(
        'vercel onboard'
      )} in an interactive terminal to continue.`
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

/** Sent as the `askUser` result when the user is taking over in the TUI. */
const HANDOFF_ASK_USER_ANSWER =
  'The user is switching to your own interactive interface to continue ' +
  'there. End your turn immediately — no further actions, no summary. ' +
  'They saw your question and will answer it in your interface.';

/** The `askUser` answer when the user pressed esc to steer mid-turn. */
const STEER_ASK_USER_ANSWER =
  'The user pressed the interrupt key to give you an instruction. End your ' +
  'turn immediately — no further actions, no summary. They saw your ' +
  'question; their instruction arrives as the next message and takes ' +
  'precedence over it.';

/**
 * Ask what the agent should do differently, after an esc interrupt paused
 * the turn. The instruction becomes the next turn of the same conversation
 * — the agent keeps its inventory and plan, and course-corrects instead of
 * starting over. An empty line falls back to the follow-up menu.
 */
async function readSteeringInstruction(
  client: Client,
  profile: OnboardProfile
): Promise<string | undefined> {
  if (!client.stdin.isTTY) {
    return undefined;
  }

  const endSteer = profile.start('waiting for your instruction');
  try {
    output.print('\n');
    const reply = await client.input.text({
      message: 'Steer the agent (empty line opens the menu):',
    });
    const trimmed = reply.trim();
    if (!trimmed) {
      return undefined;
    }
    output.print('\n');
    return trimmed;
  } catch {
    // An interrupted prompt means no instruction; the menu takes over.
    return undefined;
  } finally {
    endSteer();
  }
}

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
  /** Stable id, required to resume the session in a fresh runtime. */
  sessionId?: string;
  destroy: () => Promise<unknown>;
  /** Persist resume state and stop the runtime. Newer runtimes only. */
  stop?: () => Promise<unknown>;
  /**
   * The adapter's normalized view of the runtime's own conversation store,
   * including exchanges that happened outside this process. Newer runtimes
   * only, and only where the adapter can reach the store.
   */
  readHistory?: (options?: {
    since?: string;
  }) => Promise<{ messages: StintMessage[]; cursor: string } | undefined>;
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
        `authenticated, then run ${cmd('vercel onboard')} again. The incomplete ` +
        `install is detected and rebuilt automatically.`
    );
    return;
  }

  if (/undefined .*createSession|createSession.* undefined/.test(message)) {
    output.log(
      `The installed ${HARNESS_CORE_PACKAGE} does not support running without a ` +
        `sandbox provider, which ${cmd('vercel onboard')} relies on to work against ` +
        `your local project. That capability is not in a published release yet.\n` +
        `Installed at: ${getHarnessPackagesDir()}\n\n` +
        `Until it is published, point ${HARNESS_SOURCE_ENV_VAR} at a checkout of ` +
        `vercel/ai with the packages built:\n` +
        `    pnpm --filter ${HARNESS_CORE_PACKAGE} build\n` +
        `    ${HARNESS_SOURCE_ENV_VAR}=/path/to/ai ${cmd('vercel onboard')}`
    );
  }
}

/**
 * Point the process at the workspace and hand back a restore function.
 *
 * The local workspace roots itself at `process.cwd()`, while `vercel onboard`
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
        `onboard: could not restore the working directory: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };
}

/**
 * Replace the SDK's "no sandbox, no isolation" warning with a debug line.
 *
 * The warning is correct, but `vercel onboard` has already told the user, in
 * more specific terms and before they consented, that the agent will read and
 * modify files in this directory. Printing it again immediately after they
 * agreed reads as a malfunction rather than a caution.
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
    createSession: (options?: {
      sessionId?: string;
      resumeFrom?: unknown;
    }) => Promise<HarnessSession>;
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
