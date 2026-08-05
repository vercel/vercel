import chalk from 'chalk';
import type Client from '../../util/client';
import cmd from '../../util/output/cmd';
import output from '../../output-manager';
import type { DetectedHarness } from './detect-harnesses';
import {
  ensureHarnessPackages,
  getHarnessPackagesDir,
  type HarnessLoader,
} from './install-harness-packages';
import { HARNESS_SOURCE_ENV_VAR } from './local-harness-source';
import { ActivityIndicator, WORKING_PHRASES } from './activity';
import { answerAskUser, createAskUserTool, isAskUserTool } from './ask-user';
import {
  isHarnessBootstrapped,
  prepareHarnessBootstrap,
} from './prepare-bootstrap';
import { StreamRenderer } from './render-stream';
import { DeploymentTracker } from './deployments';
import { printContinuation } from './session-continuation';
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
  const endCreate = profile.start('start agent session', {
    bridgeInstalled: bootstrapped,
  });
  let session;
  try {
    session = await agent.createSession();
  } catch (err) {
    preparing.stop();
    reportSessionStartFailure(err, harness);
    return 1;
  } finally {
    endCreate();
    preparing.stop();
  }

  const activity = new ActivityIndicator();
  activity.describe({
    actor: agentLabel(harness.id),
    sessionStartedAt: Date.now(),
  });

  const renderer = new StreamRenderer(activity, profile);
  renderer.attribute(harness.id, { verbose: options.verbose });
  const deployments = new DeploymentTracker();
  renderer.trackDeployments(deployments);
  const startedAt = Date.now();

  try {
    // The agent routinely ends a turn by asking something — which team to use,
    // whether to approve a plan that costs money. Ending the process there would
    // throw away the session and force the whole discovery phase to be redone,
    // so keep taking turns until the user is done.
    let turnPrompt: string | undefined = tools
      ? prompt
      : prompt + NO_ASK_USER_SUFFIX;
    let turnNumber = 0;

    while (turnPrompt !== undefined) {
      turnNumber += 1;
      const endTurn = profile.start(`turn ${turnNumber}`);
      let exitCode: number;
      try {
        exitCode = await runTurn({
          agent,
          session,
          prompt: turnPrompt,
          renderer,
          activity,
          client,
          profile,
        });
      } finally {
        endTurn({ toolCalls: renderer.toolCallCount });
      }
      if (exitCode !== 0) {
        return exitCode;
      }

      const endReply = profile.start('waiting for your reply');
      turnPrompt = await readReply(client, harness.label);
      endReply({ continued: turnPrompt !== undefined });
    }

    return 0;
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

    // Before the continuation, and before the timing: a URL the session
    // produced is the result, and the result goes at the end where it is read.
    printDeployments(deployments, profile);

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
 * Report what the session deployed.
 *
 * The agent runs `vercel deploy` inside a tool call, so without this the URL
 * scrolls past in the transcript and the run ends by telling the user how to
 * resume rather than what it produced. Recorded into the profile too, so a
 * finished run can be tied to its deployment afterwards.
 */
function printDeployments(
  deployments: DeploymentTracker,
  profile: ShipProfile
): void {
  const found = deployments.list();
  if (found.length === 0) {
    return;
  }

  profile.set(
    'deployments',
    found.map(deployment => deployment.url)
  );

  output.print('\n');
  vercelSays(found.length === 1 ? 'Deployed:' : 'Deployed:');
  for (const deployment of found) {
    const label = deployment.production ? chalk.yellow(' production') : '';
    vercelSays(chalk.cyan(deployment.url) + chalk.dim(label), true);
    if (deployment.inspectUrl) {
      vercelSays(chalk.dim(deployment.inspectUrl), true);
    }
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
  profile: ShipProfile;
}): Promise<number> {
  const { agent, session, prompt, renderer, activity, client, profile } =
    options;

  renderer.beginTurn();

  // Runs for the whole turn. The renderer pauses it around each write, so it is
  // visible during every gap (waiting on the model, waiting on a tool) and
  // invisible while output is flowing.
  activity.start(WORKING_PHRASES);

  try {
    let result = await agent.stream({ session, prompt });
    await drain(result, renderer);

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

      activity.pause();
      const endAsk = profile.start('waiting for your answer', {
        questions: pending.length,
      });
      const toolResultContinuations: HarnessToolResultContinuation[] = [];
      for (const call of pending) {
        toolResultContinuations.push({
          toolCallId: call.toolCallId,
          output: await answerAskUser(client, call.input),
        });
      }
      endAsk();
      activity.resume();

      result = await agent.continueStream({
        session,
        toolResultContinuations,
      });
      await drain(result, renderer);
    }

    const finishReason = await result.finishReason;
    output.debug(`harness finish reason: ${finishReason}`);

    return finishReason === 'error' ? 1 : 0;
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

async function drain(
  result: HarnessStreamResult,
  renderer: StreamRenderer
): Promise<void> {
  for await (const part of result.fullStream) {
    renderer.render(part);
  }
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
  HarnessAgent: new (config: unknown) => {
    createSession: () => Promise<HarnessSession>;
    stream: (options: {
      session: HarnessSession;
      prompt: string;
    }) => Promise<HarnessStreamResult>;
    continueStream: (options: {
      session: HarnessSession;
      toolResultContinuations: HarnessToolResultContinuation[];
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
