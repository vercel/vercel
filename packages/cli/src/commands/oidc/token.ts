import { decodeJwt } from 'jose';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { isAPIError, ProjectNotFound } from '../../util/errors-ts';
import { tokenSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { OidcTokenTelemetryClient } from '../../util/telemetry/commands/oidc/token';
import { getCommandName } from '../../util/pkg-name';

interface OidcTokenResponse {
  token: string;
}

async function getOidcToken(
  client: Client,
  projectId: string,
  teamId?: string
): Promise<OidcTokenResponse> {
  const params = new URLSearchParams({ source: 'vercel-cli:oidc:token' });
  if (teamId) {
    params.set('teamId', teamId);
  }

  const url = `/v1/projects/${encodeURIComponent(projectId)}/token?${params}`;
  return client.fetch<OidcTokenResponse>(url, { method: 'POST' });
}

export default async function token(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new OidcTokenTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(tokenSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { flags: opts } = parsedArgs;
  const jsonOutput = opts['--json'];
  const projectFlag = opts['--project'];

  telemetryClient.trackCliFlagJson(jsonOutput);
  telemetryClient.trackCliFlagProject(projectFlag);

  let projectId: string;
  let teamId: string | undefined;

  // Resolve project from --project flag or linked project
  if (projectFlag) {
    // Use --project flag
    const project = await getProjectByNameOrId(client, projectFlag);
    if (project instanceof ProjectNotFound) {
      output.error(`Project not found: ${projectFlag}`);
      return 1;
    }
    projectId = project.id;
    teamId = project.accountId;
  } else {
    // Fall back to linked project
    const link = await getLinkedProject(client);
    if (link.status === 'error') {
      return link.exitCode;
    }
    if (link.status === 'not_linked') {
      output.error(
        `No project linked. Use --project flag or run ${getCommandName('link')} first.`
      );
      return 1;
    }
    projectId = link.project.id;
    teamId = link.org.type === 'team' ? link.org.id : undefined;
  }

  // Fetch the OIDC token
  let response: OidcTokenResponse;
  try {
    response = await getOidcToken(client, projectId, teamId);
  } catch (err) {
    if (isAPIError(err)) {
      if (err.status === 403) {
        output.error(
          'OIDC is not enabled for this project. Enable it in your project settings.'
        );
        return 1;
      }
      output.error(`Failed to get OIDC token: ${err.message}`);
      return 1;
    }
    throw err;
  }

  const { token: oidcToken } = response;

  // Output the token
  if (jsonOutput) {
    // Decode JWT to get expiration
    let expiresAt: string | undefined;
    try {
      const { exp } = decodeJwt(oidcToken);
      if (exp !== undefined) {
        expiresAt = new Date(exp * 1000).toISOString();
      }
    } catch {
      // Token might not be a valid JWT, continue without expiration
    }

    const result = {
      token: oidcToken,
      ...(expiresAt && { expiresAt }),
    };
    client.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    // Plain output for piping
    client.stdout.write(oidcToken + '\n');
  }

  return 0;
}
