import type Client from '../../util/client';
import {
  getLatestCiAttempt,
  listCiInvocations,
  resolveCiTeam,
} from '../../util/ci/api';
import { toApiRunId } from '../../util/ci/ids';
import { toShortSha } from '../../util/ci/run-status';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { buildCiCommand, ciDisplayText } from '../../util/ci/output';
import { shouldEmitNonInteractiveCommandError } from '../../util/agent-output';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { resolveCiContext } from './context';
import { failCi, handleCiApiError, invalidCiArguments } from './errors';

export type CiRunTarget = {
  invocationId: string;
  attempt?: number;
  accountId?: string;
};

/**
 * Resolves the run a command acts on: the run ID argument when given,
 * otherwise the latest run for the current `HEAD` commit.
 */
export async function resolveRunTarget(
  client: Client,
  runArg: string | undefined,
  attempt: number | undefined
): Promise<CiRunTarget | number> {
  if (runArg !== undefined) {
    const invocationId = toApiRunId(runArg);
    if (!invocationId) {
      return invalidCiArguments(
        client,
        `Run IDs contain only letters and numbers. Find one with ${getCommandName('ci ls')}.`
      );
    }
    const team = await resolveCiTeam(client);
    if (!team.ok) {
      return team.exitCode;
    }
    return { invocationId, attempt, accountId: team.accountId };
  }

  const context = await resolveCiContext(client);
  if (typeof context === 'number') {
    return context;
  }
  const { git, accountId } = context;
  if (!git.commitSha) {
    return failCi(client, {
      reason: AGENT_REASON.CI_RUN_NOT_FOUND,
      message:
        "This repository doesn't have any commits yet. Commit and push, then try again.",
    });
  }

  if (!git.branch) {
    const command = buildCiCommand(client.argv, ['ci', 'ls', '--all-branches']);
    const exitCode = failCi(client, {
      reason: AGENT_REASON.CI_RUN_NOT_FOUND,
      message:
        "Can't find the run for HEAD while HEAD is detached. Check out its branch and try again, or list runs across all branches and pass a run ID.",
      next: [
        {
          command,
          when: 'Find a run ID across all branches, then pass it explicitly',
        },
      ],
    });
    if (!shouldEmitNonInteractiveCommandError(client)) {
      output.print(`  ${command}\n`);
    }
    return exitCode;
  }

  let invocationId: string | undefined;
  try {
    const { invocations } = await listCiInvocations(
      client,
      {
        provider: git.provider,
        repository: git.repository,
        branch: git.branch,
        commitSha: git.commitSha,
        limit: 1,
      },
      accountId
    );
    const match = invocations.find(
      invocation => invocation.commitSha === git.commitSha
    );
    invocationId = match?.invocationId;
  } catch (err) {
    return handleCiApiError(client, 'find the Vercel CI run for HEAD', err);
  }

  if (!invocationId) {
    const where = ` on ${ciDisplayText(git.branch)}`;
    return failCi(client, {
      reason: AGENT_REASON.CI_RUN_NOT_FOUND,
      message: `No Vercel CI run found for ${toShortSha(git.commitSha)}${where}. Push the commit, or pass a run ID from ${getCommandName('ci ls')}.`,
      next: [
        {
          command: buildCiCommand(client.argv, ['ci', 'ls']),
          when: 'List recent runs for this branch',
        },
      ],
    });
  }

  return { invocationId, attempt, accountId };
}

/** The requested attempt, or the latest attempt of the run. */
export async function resolveAttemptNumber(
  client: Client,
  target: CiRunTarget
): Promise<number> {
  // List rows can describe an older attempt; only the attempts endpoint is
  // authoritative when the user hasn't selected one explicitly.
  return (
    target.attempt ??
    (await getLatestCiAttempt(client, target.invocationId, target.accountId))
  );
}
