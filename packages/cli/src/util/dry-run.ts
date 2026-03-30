import type Client from './client';
import { writeAgentResponse } from './agent-response';
import { EXIT_CODE } from './exit-codes';
import output from '../output-manager';

/**
 * Describes a single action that a command WOULD take during execution.
 */
export interface DryRunAction {
  action: string; // 'api_call' | 'file_write' | 'browser_open' | 'poll' | etc.
  description: string;
  details?: Record<string, unknown>;
}

/**
 * The payload returned by a dry-run invocation.
 */
export interface DryRunResult {
  status: 'dry_run';
  reason: 'dry_run_ok';
  message: string;
  /** What the command WOULD do */
  actions: DryRunAction[];
}

/**
 * Write dry-run result as JSON (agent mode) or human-readable summary.
 *
 * Returns the exit code to use (always EXIT_CODE.SUCCESS).
 */
export function outputDryRun(client: Client, result: DryRunResult): number {
  if (client.nonInteractive) {
    writeAgentResponse(client, {
      status: result.status,
      reason: result.reason,
      message: result.message,
      data: { actions: result.actions },
    });
    return EXIT_CODE.SUCCESS;
  }

  // Human-readable output
  output.log(`Dry run: ${result.message}`);
  output.log('');
  output.log('Actions that would be performed:');
  for (let i = 0; i < result.actions.length; i++) {
    const a = result.actions[i];
    output.log(`  ${i + 1}. [${a.action}] ${a.description}`);
    if (a.details) {
      for (const [key, value] of Object.entries(a.details)) {
        output.log(`     ${key}: ${String(value)}`);
      }
    }
  }

  return EXIT_CODE.SUCCESS;
}
