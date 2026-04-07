import type arg from 'arg';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import type { CommandOption } from '../help';
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
const ENABLED_DEPLOYMENT_TYPE = 'prod_deployment_urls_and_all_previews';
const DEFAULT_SKEW_PROTECTION_MAX_AGE = 2592000;

const PROTECTION_KEYS = [
  'passwordProtection',
  'ssoProtection',
  'skewProtection',
  'customerSupportCodeVisibility',
  'gitForkProtection',
  'protectionBypass',
] as const;

function isProtectionAction(v: string | undefined): v is ProtectionAction {
  return !!v && (PROTECTION_ACTIONS as readonly string[]).includes(v);
}

/** Same visibility rules as `buildCommandOptionLines` (non-deprecated, documented). */
function isCommandOptionDocumented(o: CommandOption): boolean {
  return !o.deprecated && o.description !== undefined;
}

/** All boolean toggles the parser accepts (used to detect “at least one selector”). */
function getProtectionParserToggleFlagNames(spec: arg.Spec): string[] {
  return protectionSubcommand.options
    .filter(
      o =>
        o.type === Boolean &&
        spec[`--${o.name}` as keyof typeof spec] === Boolean
    )
    .map(o => `--${o.name}`);
}

/** Documented toggles for the error text (may include flags omitted from `next`). */
function getProtectionToggleFlagsForMessage(): string[] {
  return protectionSubcommand.options
    .filter(o => o.type === Boolean && isCommandOptionDocumented(o))
    .map(o => `--${o.name}`);
}

/** Toggles to suggest in `next`: documented, parser-backed, and not opted out via `agentSuggest`. */
function getProtectionToggleFlagsForNext(spec: arg.Spec): string[] {
  return protectionSubcommand.options
    .filter(o => {
      const opt = o as CommandOption;
      return (
        opt.type === Boolean &&
        isCommandOptionDocumented(opt) &&
        opt.agentSuggest !== false &&
        spec[`--${opt.name}` as keyof typeof spec] === Boolean
      );
    })
    .map(o => `--${(o as CommandOption).name}`);
}

function buildMissingSelectorMessage(): string {
  const flags = getProtectionToggleFlagsForMessage();
  const joined = flags.join(', ');
  return `No protection selected. Pass one or more selectors (for example ${joined}).`;
}

function buildMissingSelectorNext(
  client: Client,
  action: ProtectionAction,
  spec: arg.Spec
): Array<{ command: string; when: string }> {
  return getProtectionToggleFlagsForNext(spec).map(flag => ({
    command: buildCommandWithGlobalFlags(
      client.argv,
      `project protection ${action} ${flag}`
    ),
    when: `Run with ${flag} (same action)`,
  }));
}

export default async function protection(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(
    protectionSubcommand.options
  );
  let parsedArgs: { args: string[]; flags: Record<string, unknown> };
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

  const selectedSso = Boolean(parsedArgs.flags['--sso']);
  const selectedPassword = Boolean(parsedArgs.flags['--password']);
  const selectedSkew = Boolean(parsedArgs.flags['--skew']);
  const selectedSupportCode = Boolean(
    parsedArgs.flags['--customer-support-code-visibility']
  );
  const selectedGitFork = Boolean(parsedArgs.flags['--git-fork-protection']);
  const selectedProtectionBypass = Boolean(
    parsedArgs.flags['--protection-bypass']
  );
  const protectionBypassSecret = parsedArgs.flags[
    '--protection-bypass-secret'
  ] as string | undefined;

  const parserToggleFlagNames =
    getProtectionParserToggleFlagNames(flagsSpecification);
  const hasAnySelection = parserToggleFlagNames.some(flag =>
    Boolean(parsedArgs.flags[flag])
  );

  if (action && !hasAnySelection) {
    const msg = buildMissingSelectorMessage();
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: msg,
        hint: 'Use `project protection enable|disable` with at least one protection flag.',
        next: buildMissingSelectorNext(client, action, flagsSpecification),
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
    const patchBody: JSONObject = {};
    if (selectedSso) {
      patchBody.ssoProtection =
        action === 'enable'
          ? { deploymentType: ENABLED_DEPLOYMENT_TYPE }
          : null;
    }
    if (selectedPassword) {
      patchBody.passwordProtection =
        action === 'enable'
          ? { deploymentType: ENABLED_DEPLOYMENT_TYPE }
          : null;
    }
    if (selectedSkew) {
      patchBody.skewProtectionMaxAge =
        action === 'enable' ? DEFAULT_SKEW_PROTECTION_MAX_AGE : 0;
    }
    if (selectedSupportCode) {
      patchBody.customerSupportCodeVisibility = action === 'enable';
    }
    if (selectedGitFork) {
      patchBody.gitForkProtection = action === 'enable';
    }

    if (selectedProtectionBypass) {
      if (action === 'disable' && !protectionBypassSecret) {
        const secretMsg =
          'Disabling protection bypass requires --protection-bypass-secret <secret>.';
        outputAgentError(
          client,
          {
            status: 'error',
            reason: AGENT_REASON.MISSING_ARGUMENTS,
            message: secretMsg,
            hint: 'Pass the existing automation bypass secret to revoke it.',
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'project protection disable --protection-bypass --protection-bypass-secret <secret>'
                ),
                when: 'Replace <secret> with the bypass secret to revoke',
              },
            ],
          },
          2
        );
        output.error(secretMsg);
        return 2;
      }
      try {
        const bypassBody =
          action === 'enable'
            ? {
                generate: protectionBypassSecret
                  ? { secret: protectionBypassSecret }
                  : {},
              }
            : {
                revoke: {
                  secret: protectionBypassSecret,
                  regenerate: false,
                },
              };
        await client.fetch(
          `/v1/projects/${encodeURIComponent(project.id)}/protection-bypass`,
          {
            method: 'PATCH',
            body: bypassBody,
          }
        );
      } catch (err: unknown) {
        exitWithNonInteractiveError(client, err, 1, { variant: 'protection' });
        printError(err);
        return 1;
      }
    }

    if (Object.keys(patchBody).length > 0) {
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
    }

    if (preferJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            action,
            projectId: project.id,
            projectName: project.name,
            ssoProtection: selectedSso ? action === 'enable' : undefined,
            passwordProtection: selectedPassword
              ? action === 'enable'
              : undefined,
            skewProtection: selectedSkew ? action === 'enable' : undefined,
            customerSupportCodeVisibility: selectedSupportCode
              ? action === 'enable'
              : undefined,
            gitForkProtection: selectedGitFork
              ? action === 'enable'
              : undefined,
            protectionBypass: selectedProtectionBypass
              ? action === 'enable'
              : undefined,
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
