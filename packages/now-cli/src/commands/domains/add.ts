import chalk from 'chalk';
import psl from 'psl';

import { NowContext } from '../../types';
import { Output } from '../../util/output';
import * as ERRORS from '../../util/errors-ts';
import Client from '../../util/client';
import cmd from '../../util/output/cmd';
import formatNSTable from '../../util/format-ns-table';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import { getDomain } from '../../util/domains/get-domain';
import { getLinkedProject } from '../../util/projects/link';
import { addDomainToProject } from '../../util/projects/add-domain-to-project';
import { removeDomainFromProject } from '../../util/projects/remove-domain-from-project';

type Options = {
  '--debug': boolean;
  '--force': boolean;
};

export default async function add(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const {
    authConfig: { token },
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const force = opts['--force'];
  const client = new Client({ apiUrl, token, currentTeam, debug });
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
    output.error(`${getCommandName('domains add <domain>')} expects one arguments.`);
    return 1;
  } else if (!project && args.length !== 2) {
    output.error(
      `${getCommandName('domains add <domain> <project>')} expects two arguments.`
    );
    return 1;
  }

  const domainName = String(args[0]);
  const projectName = project ? project.name : String(args[1]);

  const parsedDomain = psl.parse(domainName);

  if (parsedDomain.error) {
    output.error(`The provided domain name ${param(domainName)} is invalid.`);
    return 1;
  }

  const { domain } = parsedDomain;

  if (!domain) {
    output.error(`The provided domain '${param(domainName)}' is not valid.`);
    return 1;
  }

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
          output.error(removeResponse.message);
          return 1;
        }

        aliasTarget = await addDomainToProject(client, projectName, domainName);
      }
    }

    if (aliasTarget instanceof Error) {
      output.error(aliasTarget.message);
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
    output.error(domainResponse.message);
    return 1;
  }

  if (!domainResponse.verified) {
    output.warn(
      `The domain was added but it is not verified. ` +
        `To verify it, you should change your domain nameservers to the following intended set`
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
    output.print('  Read more: https://err.sh/now/domain-verification\n\n');
  } else {
    output.log(
      `The domain will automatically get assigned to your latest production deployment.`
    );
  }

  return 0;
}
