import chalk from 'chalk';

import * as ERRORS from '../../util/errors-ts.js';
import Client from '../../util/client.js';
import formatNSTable from '../../util/format-ns-table.js';
import getScope from '../../util/get-scope.js';
import stamp from '../../util/output/stamp.js';
import { getCommandName } from '../../util/pkg-name.js';
import { getDomain } from '../../util/domains/get-domain.js';
import { getLinkedProject } from '../../util/projects/link.js';
import { isPublicSuffix } from '../../util/domains/is-public-suffix.js';
import { getDomainConfig } from '../../util/domains/get-domain-config.js';
import { addDomainToProject } from '../../util/projects/add-domain-to-project.js';
import { removeDomainFromProject } from '../../util/projects/remove-domain-from-project.js';
import code from '../../util/output/code.js';

type Options = {
  '--debug': boolean;
  '--force': boolean;
};

export default async function add(
  client: Client,
  opts: Partial<Options>,
  args: string[]
) {
  const { output } = client;
  const force = opts['--force'];
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
  } else if (!project && args.length !== 2) {
    output.error(
      `${getCommandName(
        'domains add <domain> <project>'
      )} expects two arguments.`
    );
    return 1;
  }

  const domainName = String(args[0]);
  const projectName = project ? project.name : String(args[1]);

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
  console.log(
    `${chalk.cyan('> Success!')} Domain ${chalk.bold(
      domainName
    )} added to project ${chalk.bold(projectName)}. ${addStamp()}`
  );

  if (isPublicSuffix(domainName)) {
    output.log(
      `The domain will automatically get assigned to your latest production deployment.`
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
      `This domain is not configured properly. To configure it you should either:`
    );
    output.print(
      `  ${chalk.grey('a)')} ` +
        `Set the following record on your DNS provider to continue: ` +
        `${code(`A ${domainName} 76.76.21.21`)} ` +
        `${chalk.grey('[recommended]')}\n`
    );
    output.print(
      `  ${chalk.grey('b)')} ` +
        `Change your Domains's nameservers to the intended set`
    );
    output.print(
      `\n${formatNSTable(
        domainResponse.intendedNameservers,
        domainResponse.nameservers,
        { extraSpace: '     ' }
      )}\n\n`
    );
    output.print(
      `  We will run a verification for you and you will receive an email upon completion.\n`
    );
    output.print('  Read more: https://vercel.link/domain-configuration\n\n');
  } else {
    output.log(
      `The domain will automatically get assigned to your latest production deployment.`
    );
  }

  return 0;
}
