import chalk from 'chalk';

import { NowContext } from '../../types';
import * as ERRORS from '../../util/errors-ts';
import Client from '../../util/client';
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

type Options = {
  '--debug': boolean;
  '--force': boolean;
};

export default async function add(
  ctx: NowContext,
  opts: Options,
  args: string[]
) {
  const {
    authConfig: { token },
    output,
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const force = opts['--force'];
  const client = new Client({ apiUrl, token, currentTeam, debug, output });
  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  const project = await getLinkedProject(output, client).then(result => {
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
