import Sema from 'async-sema';
import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { isAPIError } from '../../../util/errors-ts';
import { outputError } from '../../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { packageName } from '../../../util/pkg-name';
import type { VcrTelemetryClient } from '../../../util/telemetry/commands/vcr';
import { permissionsRmSubcommand } from './command';
import { resolveVcrScope } from '../utils/resolve-vcr-scope';
import { validateVcrJsonOutput } from '../utils/validators';
import { emitVcrArgParseError } from '../utils/errors';
import { repositoryPermissionsPath } from '../utils/paths';
import {
  MAX_CONCURRENT_REQUESTS,
  parseTeamRefs,
  teamRefBody,
} from './team-refs';
import type { TeamOperationFailure } from './team-refs';

const USAGE = 'vcr permissions <repository> rm <team>[,<team>...]';

type RmResult =
  | { ok: true; team: string }
  | { ok: false; team: string; failure: TeamOperationFailure };

export default async function rm(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(permissionsRmSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(client, err, USAGE);
    printError(err);
    return 1;
  }

  const fr = validateVcrJsonOutput(client, parsedArgs.flags);
  if (typeof fr === 'number') {
    return fr;
  }

  // Positional args are `<repository> rm <team>...`.
  const repository = parsedArgs.args[0];
  const teamRefs = parseTeamRefs(parsedArgs.args.slice(2));
  const project = parsedArgs.flags['--project'] as string | undefined;
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  if (teamRefs.length === 0) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: `Missing team. Example: ${packageName} vcr permissions ${repository} rm team_1a2b3c4d`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `vcr permissions ${repository} ls`
            ),
            when: 'List teams with access to pick one to remove',
          },
        ],
      },
      1
    );
    return outputError(
      client,
      fr.jsonOutput,
      'MISSING_ARGUMENTS',
      `Usage: \`vercel ${USAGE}\``
    );
  }

  const scope = await resolveVcrScope(client, {
    project,
    jsonOutput: fr.jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const path = repositoryPermissionsPath(scope, repository);
  const removed: string[] = [];
  const failed: TeamOperationFailure[] = [];

  output.spinner(
    `Removing access to ${repository} for ${
      teamRefs.length === 1 ? teamRefs[0] : `${teamRefs.length} teams`
    }...`
  );
  const sema = new Sema(MAX_CONCURRENT_REQUESTS);
  let results;
  try {
    results = await Promise.all(
      teamRefs.map(async (team): Promise<RmResult> => {
        await sema.acquire();
        try {
          await client.fetch(path, {
            method: 'DELETE',
            body: teamRefBody(team),
          });
          return { ok: true, team };
        } catch (err) {
          if (!isAPIError(err)) {
            throw err;
          }
          const message = err.serverMessage || `API error (${err.status}).`;
          return {
            ok: false,
            team,
            failure: { team, code: err.code || 'API_ERROR', message },
          };
        } finally {
          sema.release();
        }
      })
    );
  } finally {
    output.stopSpinner();
  }

  for (const result of results) {
    if (!result.ok) {
      failed.push(result.failure);
      if (!fr.jsonOutput) {
        output.error(
          `Failed to remove access to ${repository} for ${result.team}: ${result.failure.message}`
        );
      }
    } else {
      removed.push(result.team);
      if (!fr.jsonOutput) {
        output.success(`Removed access to ${repository} for ${result.team}`);
      }
    }
  }

  if (failed.length > 0) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.API_ERROR,
        message: `Failed to remove access to ${repository} for ${failed
          .map(f => `${f.team} (${f.message})`)
          .join(', ')}`,
      },
      1
    );
  }

  if (fr.jsonOutput) {
    client.stdout.write(`${JSON.stringify({ removed, failed }, null, 2)}\n`);
  }

  return failed.length > 0 ? 1 : 0;
}
