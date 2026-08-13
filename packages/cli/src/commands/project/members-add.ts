import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  buildCommandWithGlobalFlags,
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { membersAddFlags, PROJECT_MEMBER_ROLES } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { email as emailRegex } from '../../util/input/regexes';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { ProjectTelemetryClient } from '../../util/telemetry/commands/project';

/**
 * Maps a single member identifier to the correct `POST /members` body field.
 *
 * The public add-member endpoint accepts exactly one of `uid`, `username`, or
 * `email` (JSON Schema `oneOf`) and resolves the user server-side. We classify
 * by shape: an email address, otherwise an opaque Vercel user id (a long
 * alphanumeric token with no separators), otherwise a username.
 */
function memberToBodyField(member: string): JSONObject {
  if (emailRegex.test(member)) {
    return { email: member };
  }
  if (/^[A-Za-z0-9]{24,}$/.test(member)) {
    return { uid: member };
  }
  return { username: member };
}

export async function membersAdd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ProjectTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification([...membersAddFlags]);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }

  if (parsedArgs.args.length !== 2) {
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message:
          'Invalid number of arguments. Usage: `vercel project members add <project> <member> --role <role>`',
        hint: `Valid roles: ${PROJECT_MEMBER_ROLES.join(', ')}`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project members add <project> <member> --role PROJECT_VIEWER'
            ),
            when: 'Add a member to a project (replace <project> and <member>)',
          },
        ],
      },
      1
    );
    output.error(
      'Invalid number of arguments. Usage: `vercel project members add <project> <member> --role <role>`'
    );
    return 1;
  }

  const [projectNameOrId, member] = parsedArgs.args;
  telemetry.trackCliArgumentProject(projectNameOrId);
  telemetry.trackCliArgumentMember(member);

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: formatResult.error,
        },
        1
      );
    }
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput || Boolean(client.nonInteractive);

  const roleRaw = parsedArgs.flags['--role'];
  telemetry.trackCliOptionRole(
    typeof roleRaw === 'string' ? roleRaw.trim().toUpperCase() : undefined
  );
  if (typeof roleRaw !== 'string' || !roleRaw.trim()) {
    const message = `\`--role\` is required. Valid roles: ${PROJECT_MEMBER_ROLES.join(', ')}`;
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message,
        },
        1
      );
    }
    output.error(message);
    return 1;
  }
  const role = roleRaw.trim().toUpperCase();
  if (!(PROJECT_MEMBER_ROLES as readonly string[]).includes(role)) {
    const message = `\`--role\` must be one of: ${PROJECT_MEMBER_ROLES.join(', ')}`;
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message,
        },
        1
      );
    }
    output.error(message);
    return 1;
  }

  const body: JSONObject = { ...memberToBodyField(member), role };

  try {
    const project = await getProjectByCwdOrLink({
      client,
      commandName: 'project members add',
      projectNameOrId,
      forReadOnlyCommand: true,
    });

    const result = await client.fetch<JSONObject>(
      `/v1/projects/${encodeURIComponent(project.id)}/members`,
      {
        method: 'POST',
        body,
      }
    );

    if (asJson) {
      if (client.nonInteractive) {
        client.stdout.write(
          `${JSON.stringify(
            {
              status: AGENT_STATUS.OK,
              projectId: project.id,
              projectName: project.name,
              role,
              result,
              message: `Added ${member} to ${project.name} as ${role}.`,
              next: [
                {
                  command: buildCommandWithGlobalFlags(
                    client.argv,
                    `project members ${project.name}`
                  ),
                  when: 'List members for this project',
                },
              ],
            },
            null,
            2
          )}\n`
        );
      } else {
        client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      }
      return 0;
    }

    output.log(`Added ${member} to ${project.name} as ${role}.`);
    return 0;
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'members' });
    printError(err);
    return 1;
  }
}
