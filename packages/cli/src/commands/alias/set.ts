import chalk from 'chalk';
import type { SetDifference } from 'utility-types';
import type { AliasRecord } from '../../util/alias/create-alias';
import * as ERRORS from '../../util/errors-ts';
import assignAlias from '../../util/alias/assign-alias';
import type Client from '../../util/client';
import getDeployment from '../../util/get-deployment';
import { getDeploymentForAlias } from '../../util/alias/get-deployment-by-alias';
import getScope from '../../util/get-scope';
import type setupDomain from '../../util/domains/setup-domain';
import stamp from '../../util/output/stamp';
import { isValidName } from '../../util/is-valid-name';
import handleCertError from '../../util/certs/handle-cert-error';
import isWildcardAlias from '../../util/alias/is-wildcard-alias';
import link from '../../util/output/link';
import { getCommandName } from '../../util/pkg-name';
import toHost from '../../util/to-host';
import { AliasSetTelemetryClient } from '../../util/telemetry/commands/alias/set';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { listSubcommand } from './command';
import type { Domain } from '@vercel-internals/types';
import type { VercelConfig } from '@vercel/client';

export default async function set(client: Client, argv: string[]) {
  let parsedArguments;

  const flagsSpecification = getFlagsSpecification(listSubcommand.options);

  try {
    parsedArguments = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags: opts } = parsedArguments;

  const setStamp = stamp();
  const { localConfig } = client;
  const telemetryClient = new AliasSetTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  telemetryClient.trackCliFlagDebug(opts['--debug']);
  telemetryClient.trackCliOptionLocalConfig(opts['--local-config']);
  const { contextName, user } = await getScope(client);

  // If there are more than two args we have to error
  if (args.length > 2) {
    output.error(
      `${getCommandName(
        'alias <deployment> <target>'
      )} accepts at most two arguments`
    );
    return 1;
  }

  if (args.length >= 1 && !isValidName(args[0])) {
    output.error(
      `The provided argument "${args[0]}" is not a valid deployment`
    );
    return 1;
  }

  if (args.length >= 2 && !isValidName(args[1])) {
    output.error(`The provided argument "${args[1]}" is not a valid domain`);
    return 1;
  }

  if (args.length === 0) {
    output.error(
      `To ship to production, optionally configure your domains (${link(
        'https://vercel.link/domain-configuration'
      )}) and run ${getCommandName('--prod')}.`
    );
    return 1;
  }

  // For `vercel alias set <argument>`
  if (args.length === 1) {
    const [aliasTarget] = args;
    telemetryClient.trackCliArgumentAlias(aliasTarget);
    const deployment = handleCertError(
      await getDeploymentForAlias(
        client,
        args,
        opts['--local-config'],
        user,
        contextName,
        localConfig
      )
    );

    if (deployment === 1) {
      return deployment;
    }

    if (deployment instanceof Error) {
      output.error(deployment.message);
      return 1;
    }

    if (!deployment) {
      output.error(
        `Couldn't find a deployment to alias. Please provide one as an argument.`
      );
      return 1;
    }

    // Find the targets to perform the alias
    const targets = getTargetsForAlias(args, localConfig);

    if (targets instanceof Error) {
      output.prettyError(targets);
      return 1;
    }

    for (const target of targets) {
      output.log(`Assigning alias ${target} to deployment ${deployment.url}`);

      const record = await assignAlias(client, deployment, target, contextName);

      const handleResult = handleSetupDomainError(
        handleCreateAliasError(record)
      );

      if (handleResult === 1) {
        return 1;
      }

      output.success(
        `${chalk.bold(
          `${isWildcardAlias(target) ? '' : 'https://'}${handleResult.alias}`
        )} now points to https://${deployment.url} ${setStamp()}`
      );
    }

    return 0;
  }

  const [deploymentIdOrHost, aliasTarget] = args;
  telemetryClient.trackCliArgumentDeployment(deploymentIdOrHost);
  telemetryClient.trackCliArgumentAlias(aliasTarget);
  const deployment = handleCertError(
    await getDeployment(client, contextName, deploymentIdOrHost)
  );

  if (deployment === 1) {
    return deployment;
  }

  if (deployment === null) {
    output.error(
      `Couldn't find a deployment to alias. Please provide one as an argument.`
    );
    return 1;
  }

  output.log(`Assigning alias ${aliasTarget} to deployment ${deployment.url}`);

  const isWildcard = isWildcardAlias(aliasTarget);
  const record = await assignAlias(
    client,
    deployment,
    aliasTarget,
    contextName
  );
  const handleResult = handleSetupDomainError(handleCreateAliasError(record));
  if (handleResult === 1) {
    return 1;
  }

  const prefix = isWildcard ? '' : 'https://';

  output.success(
    `${chalk.bold(`${prefix}${handleResult.alias}`)} now points to https://${
      deployment.url
    } ${setStamp()}`
  );

  return 0;
}

type ThenArg<T> = T extends Promise<infer U> ? U : T;
type SetupDomainResolve = ThenArg<ReturnType<typeof setupDomain>>;
type SetupDomainError = Exclude<SetupDomainResolve, Domain>;

function handleSetupDomainError<T>(error: SetupDomainError | T): T | 1 {
  if (error instanceof ERRORS.DomainPermissionDenied) {
    output.error(
      `You don't have permissions over domain ${chalk.underline(
        error.meta.domain
      )} under ${chalk.bold(error.meta.context)}.`
    );
    return 1;
  }

  if (error instanceof ERRORS.UserAborted) {
    output.error('User canceled.');
    return 1;
  }

  if (error instanceof ERRORS.DomainNotFound) {
    output.error('You should buy the domain before aliasing.');
    return 1;
  }

  if (error instanceof ERRORS.UnsupportedTLD) {
    output.error(
      `The TLD for domain name ${error.meta.domain} is not supported.`
    );
    return 1;
  }

  if (error instanceof ERRORS.InvalidDomain) {
    output.error(
      `The domain ${error.meta.domain} used for the alias is not valid.`
    );
    return 1;
  }

  if (error instanceof ERRORS.DomainNotAvailable) {
    output.error(
      `The domain ${error.meta.domain} is not available to be purchased.`
    );
    return 1;
  }

  if (error instanceof ERRORS.UnexpectedDomainPurchaseError) {
    output.error('There was an unexpected error while purchasing the domain.');
    return 1;
  }

  if (error instanceof ERRORS.DomainAlreadyExists) {
    output.error(
      `The domain  ${error.meta.domain} exists for a different account.`
    );
    return 1;
  }

  if (error instanceof ERRORS.DomainPurchasePending) {
    output.error(
      `The domain ${error.meta.domain} is processing and will be available once the order is completed.`
    );
    output.print(
      '  An email will be sent upon completion so you can alias to your new domain.\n'
    );
    return 1;
  }

  if (error instanceof ERRORS.SourceNotFound) {
    output.error(
      `You can't purchase the domain you're aliasing to since you have no valid payment method.`
    );
    output.print('  Please add a valid payment method and retry.\n');
    return 1;
  }

  if (error instanceof ERRORS.DomainPaymentError) {
    output.error(
      `You can't purchase the domain you're aliasing to since your card was declined.`
    );
    output.print('  Please add a valid payment method and retry.\n');
    return 1;
  }

  if (error instanceof ERRORS.TLDNotSupportedViaCLI) {
    output.error(
      `The TLD for domain name ${error.meta.domain} is not supported via the CLI. Use the REST API or the dashboard to purchase.`
    );
    return 1;
  }

  return error;
}

type AliasResolved = ThenArg<ReturnType<typeof assignAlias>>;
type AssignAliasError = Exclude<AliasResolved, AliasRecord>;
type RemainingAssignAliasErrors = SetDifference<
  AssignAliasError,
  SetupDomainError
>;

function handleCreateAliasError<T>(
  errorOrResult: RemainingAssignAliasErrors | T
): 1 | T {
  const error = handleCertError(errorOrResult);
  if (error === 1) {
    return error;
  }

  if (error instanceof ERRORS.AliasInUse) {
    output.error(
      `The alias ${chalk.dim(
        error.meta.alias
      )} is a deployment URL or it's in use by a different team.`
    );
    return 1;
  }

  if (error instanceof ERRORS.DeploymentNotFound) {
    output.error(
      `Failed to find deployment ${chalk.dim(error.meta.id)} under ${chalk.bold(
        error.meta.context
      )}`
    );
    return 1;
  }
  if (error instanceof ERRORS.InvalidAlias) {
    output.error(
      'Invalid alias. Please confirm that the alias you provided is a valid hostname. Note: For `vercel.app`, only sub and sub-sub domains are supported.'
    );
    return 1;
  }
  if (error instanceof ERRORS.DeploymentPermissionDenied) {
    output.error(
      `No permission to access deployment ${chalk.dim(
        error.meta.id
      )} under ${chalk.bold(error.meta.context)}`
    );
    return 1;
  }

  if (error instanceof ERRORS.CertMissing) {
    output.error(
      `There is no certificate for the domain ${error.meta.domain} and it could not be created.`
    );
    output.log(
      `Please generate a new certificate manually with ${getCommandName(
        `certs issue ${error.meta.domain}`
      )}`
    );
    return 1;
  }

  if (error instanceof ERRORS.InvalidDomain) {
    output.error(
      `The domain ${error.meta.domain} used for the alias is not valid.`
    );
    return 1;
  }

  if (
    error instanceof ERRORS.DomainPermissionDenied ||
    error instanceof ERRORS.DeploymentFailedAliasImpossible ||
    error instanceof ERRORS.InvalidDeploymentId
  ) {
    output.error(error.message);
    return 1;
  }

  if (error instanceof ERRORS.DeploymentNotReady) {
    output.error(error.message);
    return 1;
  }

  return error;
}

function getTargetsForAlias(args: string[], { alias }: VercelConfig = {}) {
  if (args.length) {
    return [args[args.length - 1]]
      .map(target => (target.indexOf('.') !== -1 ? toHost(target) : target))
      .filter((x): x is string => !!x && typeof x === 'string');
  }

  if (!alias) {
    return new ERRORS.NoAliasInConfig();
  }

  // Check the type for the option aliases
  if (typeof alias !== 'string' && !Array.isArray(alias)) {
    return new ERRORS.InvalidAliasInConfig(alias);
  }

  return typeof alias === 'string' ? [alias] : alias;
}
