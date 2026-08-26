import output from '../../output-manager';
import { requestApproval, type GateClass } from './approval';
import { recordSessionEvent } from './ledger';
import { getOnboardSessionDir } from './session-dir';

export interface GateOperation {
  /** Canonical command, e.g. `project rm` — for the record, not for matching. */
  command: string;
  gate: GateClass;
  /** What approving allows, with concrete names the command's parser resolved. */
  description: string;
}

/**
 * Ask the user before performing a gated effect.
 *
 * Called from **inside the command handler**, after that command's own
 * argument parsing has decided what is about to happen — never from
 * classification of a shell command or an argv heuristic. The gate therefore
 * fires exactly when the code path that spends money, touches production, or
 * deletes remote state is about to execute, and a `--help` invocation never
 * reaches it by construction.
 *
 * A no-op outside an onboard session. Returns `true` to proceed; on denial or
 * timeout it has already told the agent why (including any steering line the
 * user typed), and the caller returns 1.
 */
export async function confirmGatedOperation(
  operation: GateOperation
): Promise<boolean> {
  const sessionDir = getOnboardSessionDir();
  if (!sessionDir) return true;

  // A command can guard the same effect on more than one code path (deploy
  // has two entry variants that both resolve the target); one approval covers
  // the process.
  const key = `${operation.gate}:${operation.command}`;
  if (approvedThisProcess.has(key)) return true;

  output.print(
    'This operation needs the user’s approval. Waiting for their answer in the vercel onboard session…\n'
  );

  const argv = process.argv.slice(2);
  const { verdict, instruction, auto } = await requestApproval(sessionDir, {
    command: operation.command,
    argv,
    cwd: process.cwd(),
    gate: operation.gate,
    description: operation.description,
  });
  recordSessionEvent({
    type: 'approval',
    command: operation.command,
    argv,
    gate: operation.gate,
    verdict,
    // Recorded, so "approved" in the ledger never silently means "nobody was
    // asked". The report reads this to say which kind of approval it was.
    ...(auto ? { auto: true } : {}),
    ...(instruction ? { instruction } : {}),
  });

  if (verdict === 'approved') {
    approvedThisProcess.add(key);
    return true;
  }

  output.error(
    verdict === 'timeout'
      ? 'No approval decision arrived in time, so the command did not run. Ask the user how to proceed.'
      : instruction
        ? `The user declined this command and said: ${JSON.stringify(
            instruction
          )}. Follow that instead — do not retry this command.`
        : 'The user declined this command. That is an answer, not a transient failure: do not retry it — adjust the plan, or ask the user what they would like instead.'
  );
  return false;
}

const approvedThisProcess = new Set<string>();
