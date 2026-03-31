import chalk from 'chalk';

import * as ERRORS from '../../util/errors-ts';
import { isAPIError } from '../../util/errors-ts';
import type Client from '../../util/client';
import formatNSTable from '../../util/format-ns-table';
import { resolveScopeContext } from '../../util/scope-context';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import { getDomain } from '../../util/domains/get-domain';
import { getLinkedProject } from '../../util/projects/link';
import { isPublicSuffix } from '../../util/domains/is-public-suffix';
import { getDomainConfig } from '../../util/domains/get-domain-config';
import { addDomainToProject } from '../../util/projects/add-domain-to-project';
import { removeDomainFromProject } from '../../util/projects/remove-domain-from-project';
import code from '../../util/output/code';
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
  err: Error,
  linkedProject: boolean
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

  if (aliasConflict && !looksLikeOwnershipOrPurchaseIssue) {
    const forceCmd = linkedProject
      ? `domains add ${domainName} --force`
      : `domains add ${domainName} ${projectName} --force`;
    next.push({
      command: withGlobalFlags(client, forceCmd),
      when: 'to force move from another project (only if API returns project id—otherwise remove domain from the other project first)',
    });
  }

  return next;
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
  const { contextName } = await resolveScopeContext(client, {
    requiresTeamOnly: true,
  });

  const project = await getLinkedProject(client).then(result => {
    if (result.status === 'linked') {
      return result.project;
    }

    return null;
  });

  if (project && args.length !== 1) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_arguments',
          action: 'missing_arguments',
          message: `Linked project is "${project.name}". Run: ${withGlobalFlags(client, `domains add <domain>`)}`,
          next: [
            {
              command: withGlobalFlags(client, `domains add <domain>`),
              when: 'to add a domain to the linked project (single argument)',
            },
          ],
        },
        1
      );
    }
    output.error(
      `${getCommandName('domains add <domain>')} expects one argument.`
    );
    return 1;
  }
  if (!project && args.length !== 2) {
    if (client.nonInteractive) {
      const cmd = withGlobalFlags(client, 'domains add <domain> <project>');
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_arguments',
          action: 'missing_arguments',
          message: `No linked project and domain needs a project. Run: ${cmd}`,
          next: [
            {
              command: cmd,
              when: 'to add a domain to a project (or link a project first)',
            },
          ],
        },
        1
      );
    }
    output.error(
      `${getCommandName(
        'domains add <domain> <project>'
      )} expects two arguments.`
    );
    return 1;
  }

  const domainName = String(args[0]);
  const projectName = project ? project.name : String(args[1]);
  telemetry.trackCliArgumentDomain(domainName);
  telemetry.trackCliArgumentProject(args[1]);

  const addStamp = stamp();

  let aliasTarget = await addDomainToProject(client, projectName, domainName);

  if (aliasTarget instanceof Error) {
    if (
      aliasTarget instanceof ERRORS.APIError &&
      aliasTarget.code === 'ALIAS_DOMAIN_EXIST' &&
      aliasTarget.project &&
      aliasTarget.project.id
    ) {
      if (force) {
        const removeResponse = await removeDomainFromProject(
          client,
          aliasTarget.project.id,
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

        aliasTarget = await addDomainToProject(client, projectName, domainName);
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
              aliasTarget,
              !!project
            ),
          },
          1
        );
      }
      output.prettyError(aliasTarget);
      return 1;
    }
  }

  // We can cast the information because we've just added the domain and it should be there
  output.success(
    `Domain ${chalk.bold(domainName)} added to project ${chalk.bold(
      projectName
    )}. ${addStamp()}`
  );

  if (isPublicSuffix(domainName)) {
    output.log(
      'The domain will automatically get assigned to your latest production deployment.'
    );
    return 0;
  }

  const domainResponse = await getDomain(client, contextName, domainName);

  if (domainResponse instanceof Error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'domain_fetch_failed',
          message: errorToString(domainResponse),
        },
        1
      );
    }
    output.prettyError(domainResponse);
    return 1;
  }

  const domainConfig = await getDomainConfig(client, domainName);

  if (domainConfig.misconfigured) {
    output.warn(
      'This domain is not configured properly. To configure it you should either:'
    );
    output.print(
      `  ${chalk.grey('a)')} ` +
        'Set the following record on your DNS provider to continue: ' +
        `${code(`A ${domainName} 76.76.21.21`)} ` +
        `${chalk.grey('[recommended]')}\n`
    );
    output.print(
      `  ${chalk.grey('b)')} Change your Domains's nameservers to the intended set`
    );
    output.print(
      `\n${formatNSTable(
        domainResponse.intendedNameservers,
        domainResponse.nameservers,
        { extraSpace: '     ' }
      )}\n\n`
    );
    output.print(
      '  We will run a verification for you and you will receive an email upon completion.\n'
    );
    output.print('  Read more: https://vercel.link/domain-configuration\n\n');
  } else {
    output.log(
      'The domain will automatically get assigned to your latest production deployment.'
    );
  }

  return 0;
}
