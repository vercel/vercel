import chalk from 'chalk';
import plural from 'pluralize';
import { DomainNotFound, DomainPermissionDenied } from '../../util/errors-ts';
import type { Domain } from '@vercel-internals/types';
import type Client from '../../util/client';
import deleteCertById from '../../util/certs/delete-cert-by-id';
import getDomainByName from '../../util/domains/get-domain-by-name';
import getScope from '../../util/get-scope';
import removeAliasById from '../../util/alias/remove-alias-by-id';
import removeDomainByName from '../../util/domains/remove-domain-by-name';
import stamp from '../../util/output/stamp';
import * as ERRORS from '../../util/errors-ts';
import param from '../../util/output/param';
import setCustomSuffix from '../../util/domains/set-custom-suffix';
import { findProjectsForDomain } from '../../util/projects/find-projects-for-domain';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { DomainsRmTelemetryClient } from '../../util/telemetry/commands/domains/rm';
import { removeSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';

export default async function rm(client: Client, argv: string[]) {
  const telemetry = new DomainsRmTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const [domainName] = args;

  telemetry.trackCliArgumentDomain(domainName);
  telemetry.trackCliFlagYes(opts['--yes']);

  if (!domainName) {
    output.error(
      `${getCommandName(`domains rm <domain>`)} expects one argument`
    );
    return 1;
  }

  const { contextName } = await getScope(client);

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('domains rm <domain>')}`
      )}`
    );
    return 1;
  }

  const domain = await getDomainByName(client, contextName, domainName);
  if (domain instanceof DomainNotFound || domain.name !== domainName) {
    output.error(
      `Domain not found by "${domainName}" under ${chalk.bold(contextName)}`
    );
    output.log(`Run ${getCommandName(`domains ls`)} to see your domains.`);
    return 1;
  }

  if (domain instanceof DomainPermissionDenied) {
    output.error(
      `You don't have access to the domain ${domainName} under ${chalk.bold(
        contextName
      )}`
    );
    output.log(`Run ${getCommandName(`domains ls`)} to see your domains.`);
    return 1;
  }

  const projects = await findProjectsForDomain(client, domain.name);

  if (Array.isArray(projects) && projects.length > 0) {
    output.warn(
      `The domain is currently used by ${plural(
        'project',
        projects.length,
        true
      )}.`
    );
  }

  const skipConfirmation = opts['--yes'] || false;
  if (
    !skipConfirmation &&
    !(await client.input.confirm(
      `Are you sure you want to remove ${param(domainName)}?`,
      false
    ))
  ) {
    output.log('Canceled');
    return 0;
  }

  return removeDomain(client, contextName, skipConfirmation, domain);
}

async function removeDomain(
  client: Client,
  contextName: string,
  skipConfirmation: boolean,
  domain: Domain,
  aliasIds: string[] = [],
  certIds: string[] = [],
  suffix: boolean = false,
  attempt: number = 1
): Promise<number> {
  const removeStamp = stamp();
  output.debug(`Removing domain`);

  for (const id of aliasIds) {
    output.debug(`Removing alias ${id}`);
    try {
      await removeAliasById(client, id);
    } catch (err: unknown) {
      // Ignore if the alias does not exist anymore
      if (!ERRORS.isAPIError(err) || err.status !== 404) {
        throw err;
      }
    }
  }

  for (const id of certIds) {
    output.debug(`Removing cert ${id}`);
    try {
      await deleteCertById(client, id);
    } catch (err: unknown) {
      // Ignore if the cert does not exist anymore
      if (!ERRORS.isAPIError(err) || err.status !== 404) {
        throw err;
      }
    }
  }

  if (suffix) {
    output.debug(`Removing custom suffix`);
    await setCustomSuffix(client, contextName, domain.name, null);
  }

  const removeResult = await removeDomainByName(
    client,
    contextName,
    domain.name
  );

  if (removeResult instanceof ERRORS.DomainNotFound) {
    output.error(`Domain not found under ${chalk.bold(contextName)}`);
    output.log(`Run ${getCommandName(`domains ls`)} to see your domains.`);
    return 1;
  }

  if (removeResult instanceof ERRORS.DomainPermissionDenied) {
    output.error(
      `You don't have permissions over domain ${chalk.underline(
        removeResult.meta.domain
      )} under ${chalk.bold(removeResult.meta.context)}.`
    );
    return 1;
  }

  if (removeResult instanceof ERRORS.DomainRemovalConflict) {
    if (attempt >= 2) {
      output.error(removeResult.message);
      return 1;
    }

    const {
      aliases,
      certs,
      suffix,
      transferring,
      pendingAsyncPurchase,
      resolvable,
    } = removeResult.meta;
    if (transferring) {
      output.error(
        `${param(
          domain.name
        )} transfer should be declined or approved before removing.`
      );
      return 1;
    }

    if (pendingAsyncPurchase) {
      output.error(
        `Cannot remove ${param(
          domain.name
        )} because it is still in the process of being purchased.`
      );
      return 1;
    }

    if (!resolvable) {
      output.error(removeResult.message);
      return 1;
    }

    output.log(
      `We found conflicts when attempting to remove ${param(domain.name)}.`
    );

    if (aliases.length > 0) {
      output.warn(
        `This domain's ${chalk.bold(
          plural('alias', aliases.length, true)
        )} will be removed. Run ${getCommandName(`alias ls`)} to list them.`
      );
    }

    if (certs.length > 0) {
      output.warn(
        `This domain's ${chalk.bold(
          plural('certificate', certs.length, true)
        )} will be removed. Run ${getCommandName(`cert ls`)} to list them.`
      );
    }

    if (suffix) {
      output.warn(
        `The ${chalk.bold(`custom suffix`)} associated with this domain.`
      );
    }

    if (
      !skipConfirmation &&
      !(await client.input.confirm(
        `Remove conflicts associated with domain?`,
        false
      ))
    ) {
      output.log('Canceled');
      return 0;
    }

    return removeDomain(
      client,
      contextName,
      skipConfirmation,
      domain,
      aliases,
      certs,
      suffix,
      attempt + 1
    );
  }

  output.success(`Domain ${chalk.bold(domain.name)} removed ${removeStamp()}`);
  return 0;
}
