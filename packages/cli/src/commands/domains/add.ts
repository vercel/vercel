import chalk from 'chalk';

import * as ERRORS from '../../util/errors-ts';
import { isAPIError } from '../../util/errors-ts';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import addDomainToTeam from '../../util/domains/add-domain';
import { isPublicSuffix } from '../../util/domains/is-public-suffix';
import isRootDomain from '../../util/is-root-domain';
import { getDomainConfig } from '../../util/domains/get-domain-config';
import { addDomainToProject } from '../../util/projects/add-domain-to-project';
import {
  getProjectDomain,
  getProjectDomainByName,
} from '../../util/projects/get-project-domain';
import { removeDomainFromProject } from '../../util/projects/remove-domain-from-project';
import output from '../../output-manager';
import { DomainsAddTelemetryClient } from '../../util/telemetry/commands/domains/add';
import { addSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { errorToString } from '@vercel/error-utils';
import {
  openUrlInBrowserCommand,
  outputActionRequired,
  outputAgentError,
  outputAgentSuccess,
} from '../../util/agent-output';
import { getGlobalFlagsOnlyFromArgs } from '../../util/arg-common';
import { getCommandNamePlain } from '../../util/pkg-name';

function withGlobalFlags(client: Client, commandTemplate: string): string {
  const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
  return getCommandNamePlain(`${commandTemplate} ${flags.join(' ')}`.trim());
}

const VERCEL_DOMAINS_DASHBOARD = 'https://vercel.com/dashboard/domains';

/**
 * Extra next[] entries when add fails—often user doesn't own the domain yet
 * (domains add is for domains you already own / control via DNS).
 */
function nextCommandsForDomainsAddFailure(
  client: Client,
  domainName: string,
  projectName: string,
  err: Error
): Array<{ command: string; when?: string }> {
  const next: Array<{ command: string; when?: string }> = [
    {
      command: withGlobalFlags(client, `domains inspect ${domainName}`),
      when: 'to inspect domain configuration and ownership',
    },
  ];
  const apiErr = err as Error & { code?: string };
  const code = typeof apiErr.code === 'string' ? apiErr.code : '';
  const msg = err.message.toLowerCase();
  const status = isAPIError(err) ? err.status : undefined;

  const looksLikeOwnershipOrPurchaseIssue =
    code === 'not_domain_owner' ||
    code === 'invalid_domain' ||
    code === 'domain_not_found' ||
    (status === 403 &&
      (msg.includes('not authorized') || msg.includes('forbidden'))) ||
    msg.includes('not verified') ||
    msg.includes('do not own') ||
    msg.includes('not the owner');

  // Conflict on another project—force/inspect already covered elsewhere; still hint buy if wrong domain
  const aliasConflict =
    code === 'ALIAS_DOMAIN_EXIST' ||
    status === 409 ||
    msg.includes('already assigned') ||
    msg.includes('already in use');

  if (looksLikeOwnershipOrPurchaseIssue || aliasConflict) {
    next.push({
      command: withGlobalFlags(client, `domains buy ${domainName}`),
      when: 'user must run interactively in a terminal—agents must not purchase; purchase also available in dashboard',
    });
    next.push({
      command: withGlobalFlags(client, 'domains transfer-in'),
      when: 'to transfer a domain you already own from another registrar into Vercel',
    });
    next.push({
      command: openUrlInBrowserCommand(VERCEL_DOMAINS_DASHBOARD),
      when: 'to open the Domains dashboard in your browser',
    });
  }

  // Only suggest `--force` when we have a target project to move the domain
  // onto; without one the command would be malformed (`domains add <domain>
  // --force`).
  if (aliasConflict && !looksLikeOwnershipOrPurchaseIssue && projectName) {
    next.push({
      command: withGlobalFlags(
        client,
        `domains add ${domainName} ${projectName} --force`
      ),
      when: 'to force move from another project (only if API returns project id—otherwise remove domain from the other project first)',
    });
  }

  return next;
}

/**
 * Suggested follow-ups after a successful `domains add`, surfaced to agents in
 * the non-interactive success payload's next[].
 */
function nextCommandsForDomainsAddSuccess(
  client: Client,
  domainName: string,
  projectName?: string
): Array<{ command: string; when?: string }> {
  if (!projectName) {
    return [
      {
        command: withGlobalFlags(client, `domains add ${domainName} <project>`),
        when: 'to attach this domain to a project',
      },
      {
        command: withGlobalFlags(client, `domains inspect ${domainName}`),
        when: 'to inspect domain configuration and ownership',
      },
    ];
  }

  return [
    {
      command: withGlobalFlags(client, `domains verify ${domainName}`),
      when: 'to check DNS configuration and see the records you need to set',
    },
    {
      command: withGlobalFlags(client, `domains inspect ${domainName}`),
      when: 'to inspect domain configuration and ownership',
    },
  ];
}

async function printDomainConfiguration(
  client: Client,
  domainName: string
): Promise<number> {
  if (isPublicSuffix(domainName)) {
    output.log(
      'The domain will automatically get assigned to your latest production deployment.'
    );
    return 0;
  }

  const domainConfig = await getDomainConfig(client, domainName);

  if (!(domainConfig instanceof Error) && domainConfig.misconfigured) {
    output.warn(
      `This domain is not configured properly. Run ${getCommandName(
        `domains verify ${domainName}`
      )} to see how to configure it.`
    );
  } else {
    output.log(
      'The domain will automatically get assigned to your latest production deployment.'
    );
  }

  return 0;
}

export default async function add(client: Client, argv: string[]) {
  const telemetry = new DomainsAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;

  const force = opts['--force'];
  telemetry.trackCliFlagForce(force);
  const { contextName } = await getScope(client);

  if (args.length < 1 || args.length > 2) {
    if (client.nonInteractive) {
      const cmd = withGlobalFlags(client, 'domains add <domain> [project]');
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_arguments',
          action: 'missing_arguments',
          message: `Run: ${cmd}`,
          next: [
            {
              command: cmd,
              when: 'to add a domain to your team, or pass a project name to assign it to a project',
            },
          ],
        },
        1
      );
    }
    output.error(
      `${getCommandName(
        'domains add <domain> [project]'
      )} expects one or two arguments.`
    );
    return 1;
  }

  const domainName = String(args[0]);
  const projectName = args.length === 2 ? String(args[1]) : undefined;
  telemetry.trackCliArgumentDomain(domainName);
  telemetry.trackCliArgumentProject(args[1]);

  if (!projectName) {
    if (!isPublicSuffix(domainName) && !isRootDomain(domainName)) {
      const cmd = withGlobalFlags(
        client,
        `domains add ${domainName} <project>`
      );
      const message = `Only apex domains can be added without a project. To add the subdomain ${domainName}, pass a project: ${cmd}`;
      if (client.nonInteractive) {
        outputActionRequired(
          client,
          {
            status: 'action_required',
            reason: 'project_required_for_subdomain',
            action: 'add_with_project',
            message,
            next: [
              {
                command: cmd,
                when: 'to add this subdomain to a specific project',
              },
            ],
          },
          1
        );
      }
      output.error(message);
      return 1;
    }

    const addStamp = stamp();
    let addResult: Awaited<ReturnType<typeof addDomainToTeam>>;
    try {
      addResult = await addDomainToTeam(client, domainName, contextName);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (client.nonInteractive) {
        const status = isAPIError(error) ? error.status : undefined;
        const apiErr = error as Error & { code?: string };
        const code = typeof apiErr.code === 'string' ? apiErr.code : '';
        const msg = error.message.toLowerCase();
        let reason =
          status === 403
            ? 'forbidden'
            : status === 404
              ? 'not_found'
              : status === 409 || msg.includes('already')
                ? 'alias_conflict'
                : 'domain_add_failed';
        if (
          code === 'not_domain_owner' ||
          (status === 403 && msg.includes('not authorized'))
        ) {
          reason = 'domain_not_owned';
        }
        let message = errorToString(error);
        if (
          reason === 'domain_not_owned' ||
          code === 'invalid_domain' ||
          msg.includes('not authorized to use')
        ) {
          message +=
            " domains add is for domains you already own or control via DNS. If you have not purchased the domain yet, the user must run 'domains buy' interactively (agents must not purchase) or buy in the dashboard; use 'domains transfer-in' to move an existing registration to Vercel.";
        }
        outputAgentError(
          client,
          {
            status: 'error',
            reason,
            message,
            next: nextCommandsForDomainsAddFailure(
              client,
              domainName,
              '',
              error
            ),
          },
          1
        );
      }
      output.prettyError(error);
      return 1;
    }

    if (addResult instanceof ERRORS.InvalidDomain) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'invalid_domain',
            message: errorToString(addResult),
          },
          1
        );
      }
      output.prettyError(addResult);
      return 1;
    }

    if (addResult instanceof ERRORS.DomainAlreadyExists) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'domain_already_exists',
            message: errorToString(addResult),
          },
          1
        );
      }
      output.prettyError(addResult);
      return 1;
    }

    if (client.nonInteractive) {
      outputAgentSuccess(
        client,
        {
          status: 'success',
          reason: 'domain_added',
          message: `Domain ${domainName} added to ${contextName}.`,
          next: nextCommandsForDomainsAddSuccess(client, domainName),
        },
        0
      );
    }

    output.success(
      `Domain ${chalk.bold(domainName)} added to ${chalk.bold(
        contextName
      )}. ${addStamp()}`
    );

    return 0;
  }

  const addStamp = stamp();

  let aliasTarget = await addDomainToProject(client, projectName, domainName);

  if (aliasTarget instanceof Error) {
    if (
      aliasTarget instanceof ERRORS.APIError &&
      aliasTarget.code === 'ALIAS_DOMAIN_EXIST'
    ) {
      const conflictProject = aliasTarget.project as
        | { id?: string; name?: string }
        | undefined;

      // The domain may already be assigned to the project the user requested.
      // The API does not always include the conflicting project in the error
      // body, so confirm by querying the project's domains directly. In either
      // case, treat it as an idempotent success rather than an "assigned to
      // another project" error.
      let alreadyOnRequestedProject = Boolean(
        conflictProject &&
          (conflictProject.id === projectName ||
            conflictProject.name === projectName)
      );

      if (!alreadyOnRequestedProject) {
        const existing = await getProjectDomain(
          client,
          projectName,
          domainName
        );
        alreadyOnRequestedProject = !(existing instanceof Error);
      }

      if (alreadyOnRequestedProject) {
        if (client.nonInteractive) {
          outputAgentSuccess(
            client,
            {
              status: 'success',
              reason: 'domain_already_assigned',
              message: `Domain ${domainName} is already assigned to project ${projectName}.`,
              next: nextCommandsForDomainsAddSuccess(
                client,
                domainName,
                projectName
              ),
            },
            0
          );
        }
        output.log(
          `Domain ${chalk.bold(domainName)} is already assigned to project ${chalk.bold(
            projectName
          )}. ${addStamp()}`
        );
        return printDomainConfiguration(client, domainName);
      }

      if (force) {
        // The error body does not always include the conflicting project, so
        // resolve which project the domain is currently attached to before
        // removing it.
        let currentProjectId = conflictProject?.id;
        if (!currentProjectId) {
          const currentProjectDomain = await getProjectDomainByName(
            client,
            domainName
          );
          if (!(currentProjectDomain instanceof Error)) {
            currentProjectId = currentProjectDomain.projectId;
          }
        }

        if (currentProjectId) {
          const removeResponse = await removeDomainFromProject(
            client,
            currentProjectId,
            domainName
          );

          if (removeResponse instanceof Error) {
            if (client.nonInteractive) {
              outputAgentError(
                client,
                {
                  status: 'error',
                  reason: 'domain_remove_failed',
                  message: errorToString(removeResponse),
                },
                1
              );
            }
            output.prettyError(removeResponse);
            return 1;
          }

          aliasTarget = await addDomainToProject(
            client,
            projectName,
            domainName
          );
        }
      }
    }

    if (aliasTarget instanceof Error) {
      if (client.nonInteractive) {
        const status = isAPIError(aliasTarget) ? aliasTarget.status : undefined;
        const apiErr = aliasTarget as Error & { code?: string };
        const code = typeof apiErr.code === 'string' ? apiErr.code : '';
        const msg = aliasTarget.message.toLowerCase();
        let reason =
          status === 403
            ? 'forbidden'
            : status === 404
              ? 'not_found'
              : status === 409 || msg.includes('already')
                ? 'alias_conflict'
                : 'domain_add_failed';
        if (
          code === 'not_domain_owner' ||
          (status === 403 && msg.includes('not authorized'))
        ) {
          reason = 'domain_not_owned';
        }
        let message = errorToString(aliasTarget);
        if (
          reason === 'domain_not_owned' ||
          code === 'invalid_domain' ||
          msg.includes('not authorized to use')
        ) {
          message +=
            " domains add is for domains you already own or control via DNS. If you have not purchased the domain yet, the user must run 'domains buy' interactively (agents must not purchase) or buy in the dashboard; use 'domains transfer-in' to move an existing registration to Vercel.";
        }
        outputAgentError(
          client,
          {
            status: 'error',
            reason,
            message,
            next: nextCommandsForDomainsAddFailure(
              client,
              domainName,
              projectName,
              aliasTarget
            ),
          },
          1
        );
      }
      output.prettyError(aliasTarget);
      return 1;
    }
  }

  if (client.nonInteractive) {
    outputAgentSuccess(
      client,
      {
        status: 'success',
        reason: 'domain_added',
        message: `Domain ${domainName} added to project ${projectName}.`,
        next: nextCommandsForDomainsAddSuccess(client, domainName, projectName),
      },
      0
    );
  }

  // We can cast the information because we've just added the domain and it should be there
  output.success(
    `Domain ${chalk.bold(domainName)} added to project ${chalk.bold(
      projectName
    )}. ${addStamp()}`
  );

  return printDomainConfiguration(client, domainName);
}
