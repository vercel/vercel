import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  buildCommandWithGlobalFlags,
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { protectionSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import chalk from 'chalk';
import type { JSONObject, Project } from '@vercel-internals/types';

const PROTECTION_ACTIONS = ['enable', 'disable'] as const;
type ProtectionAction = (typeof PROTECTION_ACTIONS)[number];
const DEFAULT_SKEW_PROTECTION_MAX_AGE = 2592000;

function parseSkewMaxAgeSeconds(
  value: string
): { ok: true; seconds: number } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) {
    return {
      ok: false,
      message:
        'Invalid --skew-max-age: expected a positive integer (seconds), e.g. 604800.',
    };
  }
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n <= 0) {
    return {
      ok: false,
      message:
        'Invalid --skew-max-age: value must be a positive integer within safe range.',
    };
  }
  return { ok: true, seconds: n };
}

const PROTECTION_KEYS = [
  'passwordProtection',
  'ssoProtection',
  'skewProtectionMaxAge',
  'customerSupportCodeVisibility',
  'gitForkProtection',
  'protectionBypass',
] as const;

function isProtectionAction(v: string | undefined): v is ProtectionAction {
  return !!v && (PROTECTION_ACTIONS as readonly string[]).includes(v);
}

export default async function protection(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    protectionSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: error instanceof Error ? error.message : String(error),
      },
      1
    );
    printError(error);
    return 1;
  }

  const actionArg = parsedArgs.args[0];
  const action = isProtectionAction(actionArg) ? actionArg : undefined;

  if (!action && parsedArgs.args.length > 1) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: 'Invalid arguments. Usage: `vercel project protection [name]`',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project protection'
            ),
            when: 'Show deployment protection for the linked project',
          },
        ],
      },
      2
    );
    output.error(
      'Invalid arguments. Usage: `vercel project protection [name]`'
    );
    return 2;
  }
  if (action && parsedArgs.args.length > 2) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `Invalid arguments. Usage: \`vercel project protection ${action} [name]\``,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `project protection ${action}`
            ),
            when: 'Retry with at most one project name',
          },
        ],
      },
      2
    );
    output.error(
      `Invalid arguments. Usage: \`vercel project protection ${action} [name]\``
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: formatResult.error,
      },
      1
    );
    output.error(formatResult.error);
    return 1;
  }

  const preferJson = formatResult.jsonOutput || Boolean(client.nonInteractive);

  const skewMaxAgeFlag = parsedArgs.flags['--skew-max-age'] as
    | string
    | undefined;

  if (action === 'disable' && skewMaxAgeFlag !== undefined) {
    const msg =
      '`--skew-max-age` can only be used with `project protection enable`.';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
        hint: 'Use `project protection disable ... --skew` to turn skew protection off.',
      },
      2
    );
    output.error(msg);
    return 2;
  }

  let enableSkewMaxAgeSeconds: number | undefined;
  if (action === 'enable' && skewMaxAgeFlag !== undefined) {
    const parsed = parseSkewMaxAgeSeconds(skewMaxAgeFlag);
    if (!parsed.ok) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: parsed.message,
          hint: 'Pass a positive integer number of seconds (e.g. 604800 for 7 days).',
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                'project protection enable --skew --skew-max-age 604800'
              ),
              when: 'Example with a valid max age in seconds',
            },
          ],
        },
        1
      );
      output.error(parsed.message);
      return 1;
    }
    enableSkewMaxAgeSeconds = parsed.seconds;
  }

  const selected = Boolean(parsedArgs.flags['--skew']);
  if (action && !selected) {
    const msg =
      'No protection selected. Pass --skew. Usage: `vercel project protection enable|disable [name] --skew`';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: msg,
        hint: 'Use `project protection enable|disable` with the protection flag (e.g. --skew).',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `project protection ${action} --skew`
            ),
            when: 'Example: same action with skew protection selected',
          },
        ],
      },
      2
    );
    output.error(msg);
    return 2;
  }

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project protection',
      projectNameOrId: action ? parsedArgs.args[1] : parsedArgs.args[0],
      forReadOnlyCommand: !action,
    });
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, {
      variant: 'protection',
    });
    printError(err);
    return 1;
  }

  if (action) {
    const skewProtectionMaxAge =
      action === 'enable'
        ? (enableSkewMaxAgeSeconds ?? DEFAULT_SKEW_PROTECTION_MAX_AGE)
        : 0;

    const patchBody: JSONObject = {
      skewProtectionMaxAge,
    };

    try {
      await client.fetch(`/v9/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        body: patchBody,
      });
    } catch (err: unknown) {
      exitWithNonInteractiveError(client, err, 1, { variant: 'protection' });
      printError(err);
      return 1;
    }

    if (preferJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            action,
            projectId: project.id,
            projectName: project.name,
            skewProtection: action === 'enable',
            ...(action === 'enable'
              ? { skewProtectionMaxAge }
              : { skewProtectionMaxAge: 0 }),
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

    output.log(
      `${chalk.bold('Deployment protection')} ${action === 'enable' ? 'enabled' : 'disabled'} for ${chalk.cyan(project.name)}`
    );
    return 0;
  }

  const raw = project as Project & Record<string, unknown>;
  const slice: Record<string, unknown> = {};
  for (const key of PROTECTION_KEYS) {
    if (key in raw) {
      slice[key] = raw[key];
    }
  }

  if (preferJson) {
    client.stdout.write(
      `${JSON.stringify({ projectId: project.id, name: project.name, ...slice }, null, 2)}\n`
    );
    return 0;
  }

  output.log(
    `${chalk.bold('Protection settings')} for ${chalk.cyan(project.name)} (${project.id})`
  );
  if (Object.keys(slice).length === 0) {
    output.log('No deployment protection fields returned for this project.');
    return 0;
  }
  for (const [k, v] of Object.entries(slice)) {
    output.log(`${chalk.cyan(`${k}:`)} ${JSON.stringify(v)}`);
  }
  return 0;
}
