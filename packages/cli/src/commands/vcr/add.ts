import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { isAPIError } from '../../util/errors-ts';
import { outputError } from '../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { packageName } from '../../util/pkg-name';
import type { VcrTelemetryClient } from '../../util/telemetry/commands/vcr';
import { addSubcommand } from './command';
import { resolveVcrScope } from './utils/resolve-vcr-scope';
import { validateVcrJsonOutput } from './utils/validators';
import { emitVcrArgParseError, handleVcrApiError } from './utils/errors';

export default async function add(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(addSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(client, err, 'vcr add <name> --project <name-or-id>');
    printError(err);
    return 1;
  }

  const fr = validateVcrJsonOutput(client, parsedArgs.flags);
  if (typeof fr === 'number') {
    return fr;
  }

  const name = parsedArgs.args[0];
  const project = parsedArgs.flags['--project'] as string | undefined;
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  if (!name) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: `Missing repository name. Example: ${packageName} vcr add <name>`,
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, 'vcr add <name>'),
            when: 'Replace <name> with the repository name to create',
          },
        ],
      },
      1
    );
    return outputError(
      client,
      fr.jsonOutput,
      'MISSING_ARGUMENTS',
      'Usage: `vercel vcr add <name>`'
    );
  }

  const scope = await resolveVcrScope(client, {
    project,
    jsonOutput: fr.jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const path = `/v1/vcr/repository?teamId=${encodeURIComponent(scope.teamId)}`;
  output.spinner('Creating repository...');
  try {
    const created = await client.fetch<{ repository?: { name?: string } }>(
      path,
      {
        method: 'POST',
        body: { projectId: scope.projectId, name },
      }
    );
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify(created, null, 2)}\n`);
    } else {
      output.success(`Created repository ${created.repository?.name ?? name}`);
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      return handleVcrApiError(client, err, fr.jsonOutput, {
        retry: {
          command: buildCommandWithGlobalFlags(client.argv, 'vcr ls'),
          when: 'List existing repositories (a name conflict means it already exists)',
        },
      });
    }
    throw err;
  } finally {
    output.stopSpinner();
  }
}
