import chalk from 'chalk';

import * as ERRORS from '../../util/errors-ts';
import type Client from '../../util/client';
import formatNSTable from '../../util/format-ns-table';
import getScope from '../../util/get-scope';
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
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;

  const force = opts['--force'];
  telemetry.trackCliFlagForce(force);
  const { contextName } = await getScope(client);

  const project = await getLinkedProject(client).then(result => {
    if (result.status === 'linked') {
      return result.project;
    }

    return null;
  });

  if (project && args.length !== 1) {
    output.error(
      `${getCommandName('domains add <domain>')} expects one argument.`
    );
    return 1;
  }
  if (!project && args.length !== 2) {
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
          output.prettyError(removeResponse);
          return 1;
        }

        aliasTarget = await addDomainToProject(client, projectName, domainName);
      }
    }

    if (aliasTarget instanceof Error) {
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
