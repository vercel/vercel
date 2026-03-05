import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import { schemaSubcommand } from './command';
import getScope from '../../util/get-scope';
import { getLinkedProject } from '../../util/projects/link';
import { isAPIError } from '../../util/errors-ts';

interface SchemaFlags {
  '--format'?: string;
}

interface AlertSchemaItem {
  id: string;
  type: string;
  title: string;
  unit: string;
}

function writeJsonError(client: Client, code: string, message: string): number {
  client.stdout.write(
    `${JSON.stringify({ error: { code, message } }, null, 2)}\n`
  );
  return 1;
}

function outputError(
  client: Client,
  jsonOutput: boolean,
  code: string,
  message: string
): number {
  if (jsonOutput) {
    return writeJsonError(client, code, message);
  }
  output.error(message);
  return 1;
}

async function resolveTeamReference(
  client: Client,
  jsonOutput: boolean
): Promise<string | number> {
  output.debug('Resolving team scope for `alerts schema`');
  try {
    const { team } = await getScope(client);
    if (team) {
      const teamReference = team.id;
      output.debug(`Using current team scope: ${teamReference}`);
      return teamReference;
    }
  } catch (err) {
    if (isAPIError(err)) {
      if (err.status === 401 || err.status === 403) {
        return outputError(
          client,
          jsonOutput,
          'NOT_AUTHORIZED',
          'Authentication is required to read alert schema. Pass --token <TOKEN> or run `vercel login`.'
        );
      }
      return outputError(
        client,
        jsonOutput,
        err.code || 'API_ERROR',
        err.serverMessage || `API error (${err.status}).`
      );
    }
    output.debug(err);
    return outputError(
      client,
      jsonOutput,
      'UNEXPECTED_ERROR',
      `Failed to resolve team scope: ${(err as Error).message || String(err)}`
    );
  }

  const linkedProject = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    return linkedProject.exitCode;
  }

  if (linkedProject.status === 'linked' && linkedProject.org.type === 'team') {
    const teamReference = linkedProject.org.id;
    output.debug(`Using linked project team scope: ${teamReference}`);
    return teamReference;
  }

  return outputError(
    client,
    jsonOutput,
    'NO_TEAM',
    'No team context found. Use --scope <team-slug>, run `vercel switch`, or use `vercel link` in a team project directory.'
  );
}

function printSchema(items: AlertSchemaItem[]) {
  if (items.length === 0) {
    output.log('No alert schema entries found.');
    return;
  }

  const types = [...new Set(items.map(item => item.type))];

  output.print('');
  output.log(`Filter values for --type: ${types.join(', ')}`);
  output.print('');
  for (const item of items) {
    output.log(`${item.type}  ${item.id}  ${item.title} (${item.unit})`);
  }
  output.print('');
}

export default async function schema(client: Client): Promise<number> {
  const flagsSpecification = getFlagsSpecification(schemaSubcommand.options);
  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(3), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const flags = parsedArgs.flags as SchemaFlags;
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;

  const teamReference = await resolveTeamReference(client, jsonOutput);
  if (typeof teamReference === 'number') {
    return teamReference;
  }

  output.debug(
    `Fetching alert schema from /alerts/v2/types for teamId: ${teamReference}`
  );
  try {
    const items = await client.fetch<AlertSchemaItem[]>(
      `/alerts/v2/types?teamId=${encodeURIComponent(teamReference)}`
    );

    if (jsonOutput) {
      const types = [...new Set(items.map(item => item.type))];
      client.stdout.write(
        `${JSON.stringify({ types, filters: items }, null, 2)}\n`
      );
    } else {
      printSchema(items);
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      const message =
        err.status === 401 || err.status === 403
          ? 'You do not have access to alert schema in this scope. Pass --token <TOKEN> and --scope <team-slug> with Alerts read access.'
          : err.status >= 500
            ? `The alerts schema endpoint failed on the server (${err.status}). This is not a local auth issue. Re-run with --debug and share the x-vercel-id from the failed request.`
            : err.serverMessage || `API error (${err.status}).`;
      if (jsonOutput) {
        return writeJsonError(client, err.code || 'API_ERROR', message);
      } else {
        output.error(message);
      }
      return 1;
    }
    output.debug(err);
    return outputError(
      client,
      jsonOutput,
      'UNEXPECTED_ERROR',
      `Failed to fetch alert schema: ${(err as Error).message || String(err)}`
    );
  }
}
