import type Client from '../../../util/client';
import {
  handleValidationError,
  validateAllProjectMutualExclusivity,
} from '../../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { type AlertsScope, resolveAlertsScope } from '../resolve-alerts-scope';

export async function parseRulesFlagsAndScope(
  client: Client,
  flags: { '--project'?: string; '--all'?: boolean },
  jsonOutput: boolean
): Promise<AlertsScope | number> {
  const mutual = validateAllProjectMutualExclusivity(
    flags['--all'],
    flags['--project']
  );
  if (!mutual.valid) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: mutual.message,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'alerts rules --help'
            ),
            when: 'Use either `--project` or `--all`, not both',
          },
        ],
      },
      1
    );
    return handleValidationError(mutual, jsonOutput, client);
  }
  return resolveAlertsScope(client, {
    project: flags['--project'],
    all: flags['--all'],
    jsonOutput,
  });
}

export type { AlertsScope };
