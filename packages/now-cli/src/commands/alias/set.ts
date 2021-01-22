import chalk from 'chalk';
import { SetDifference } from 'utility-types';
import { AliasRecord } from '../../util/alias/create-alias';
import { NowContext, Domain } from '../../types';
import { Output } from '../../util/output';
import * as ERRORS from '../../util/errors-ts';
import assignAlias from '../../util/alias/assign-alias';
import Client from '../../util/client';
import formatNSTable from '../../util/format-ns-table';
import getDeploymentByIdOrHost from '../../util/deploy/get-deployment-by-id-or-host';
import { getDeploymentForAlias } from '../../util/alias/get-deployment-by-alias';
import getScope from '../../util/get-scope';
import setupDomain from '../../util/domains/setup-domain';
import stamp from '../../util/output/stamp';
import { isValidName } from '../../util/is-valid-name';
import handleCertError from '../../util/certs/handle-cert-error';
import isWildcardAlias from '../../util/alias/is-wildcard-alias';
import link from '../../util/output/link';
import { User } from '../../types';
import { getCommandName } from '../../util/pkg-name';
import toHost from '../../util/to-host';
import { NowConfig } from '../../util/dev/types';

type Options = {
  '--debug': boolean;
  '--local-config': string;
};

export default async function set(
  ctx: NowContext,
  opts: Options,
  args: string[]
) {
  const {
    authConfig: { token },
    output,
    config,
    localConfig,
  } = ctx;

  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const setStamp = stamp();

  const { '--debug': debugEnabled } = opts;

  const client = new Client({
    apiUrl,
    token,
    currentTeam,
    debug: debugEnabled,
    output,
  });

  let user: User;
  let contextName: string | null = null;

  try {
    ({ contextName, user } = await getScope(client));
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  // If there are more than two args we have to error
  if (args.length > 2) {
    output.error(
      `${getCommandName(
        `alias <deployment> <target>`
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
        'https://vercel.com/docs/v2/custom-domains'
      )}) and run ${getCommandName(`--prod`)}.`
    );
    return 1;
  }

  // For `vercel alias set <argument>`
  if (args.length === 1) {
    const deployment = handleCertError(
      output,
      await getDeploymentForAlias(
        client,
        output,
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

      const record = await assignAlias(
        output,
        client,
        deployment,
        target,
        contextName
      );

      const handleResult = handleSetupDomainError(
        output,
        handleCreateAliasError(output, record)
      );

      if (handleResult === 1) {
        return 1;
      }

      console.log(
        `${chalk.cyan('> Success!')} ${chalk.bold(
          `${isWildcardAlias(target) ? '' : 'https://'}${handleResult.alias}`
        )} now points to https://${deployment.url} ${setStamp()}`
      );
    }

    return 0;
  }

  const [deploymentIdOrHost, aliasTarget] = args;
  const deployment = handleCertError(
    output,
    await getDeploymentByIdOrHost(client, contextName, deploymentIdOrHost)
  );

  if (deployment === 1) {
    return deployment;
  }

  if (deployment instanceof ERRORS.DeploymentNotFound) {
    output.error(
      `Failed to find deployment "${deployment.meta.id}" under ${chalk.bold(
        contextName
      )}`
    );
    return 1;
  }

  if (deployment instanceof ERRORS.DeploymentPermissionDenied) {
    output.error(
      `No permission to access deployment "${
        deployment.meta.id
      }" under ${chalk.bold(deployment.meta.context)}`
    );
    return 1;
  }

  if (deployment instanceof ERRORS.InvalidDeploymentId) {
    output.error(deployment.message);
    return 1;
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
    output,
    client,
    deployment,
    aliasTarget,
    contextName
  );
  const handleResult = handleSetupDomainError(
    output,
    handleCreateAliasError(output, record)
  );
  if (handleResult === 1) {
    return 1;
  }

  const prefix = isWildcard ? '' : 'https://';

  console.log(
    `${chalk.cyan('> Success!')} ${chalk.bold(
      `${prefix}${handleResult.alias}`
    )} now points to https://${deployment.url} ${setStamp()}`
  );

  return 0;
}

type ThenArg<T> = T extends Promise<infer U> ? U : T;
type SetupDomainResolve = ThenArg<ReturnType<typeof setupDomain>>;
type SetupDomainError = Exclude<SetupDomainResolve, Domain>;

function handleSetupDomainError<T>(
  output: Output,
  error: SetupDomainError | T
): T | 1 {
  if (
    error instanceof ERRORS.DomainVerificationFailed ||
    error instanceof ERRORS.DomainNsNotVerifiedForWildcard
  ) {
    const { nsVerification, domain } = error.meta;

    output.error(
      `We could not alias since the domain ${domain} could not be verified due to the following reasons:\n`
    );
    output.print(
      `Nameservers verification failed since we see a different set than the intended set:`
    );
    output.print(
      `\n${formatNSTable(
        nsVerification.intendedNameservers,
        nsVerification.nameservers,
        { extraSpace: '     ' }
      )}\n\n`
    );
    output.print('  Read more: https://err.sh/vercel/domain-verification\n');
    return 1;
  }

  if (error instanceof ERRORS.DomainPermissionDenied) {
    output.error(
      `You don't have permissions over domain ${chalk.underline(
        error.meta.domain
      )} under ${chalk.bold(error.meta.context)}.`
    );
    return 1;
  }

  if (error instanceof ERRORS.UserAborted) {
    output.error(`User aborted`);
    return 1;
  }

  if (error instanceof ERRORS.DomainNotFound) {
    output.error(`You should buy the domain before aliasing.`);
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

  if (error instanceof ERRORS.DomainServiceNotAvailable) {
    output.error(
      `The domain purchase service is not available. Try again later.`
    );
    return 1;
  }

  if (error instanceof ERRORS.UnexpectedDomainPurchaseError) {
    output.error(`There was an unexpected error while purchasing the domain.`);
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
      `  An email will be sent upon completion so you can alias to your new domain.\n`
    );
    return 1;
  }

  if (error instanceof ERRORS.SourceNotFound) {
    output.error(
      `You can't purchase the domain you're aliasing to since you have no valid payment method.`
    );
    output.print(`  Please add a valid payment method and retry.\n`);
    return 1;
  }

  if (error instanceof ERRORS.DomainPaymentError) {
    output.error(
      `You can't purchase the domain you're aliasing to since your card was declined.`
    );
    output.print(`  Please add a valid payment method and retry.\n`);
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
  output: Output,
  errorOrResult: RemainingAssignAliasErrors | T
): 1 | T {
  const error = handleCertError(output, errorOrResult);
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
      `Invalid alias. Please confirm that the alias you provided is a valid hostname. Note: For \`vercel.app\`, only sub and sub-sub domains are supported.`
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

function getTargetsForAlias(args: string[], { alias }: NowConfig) {
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
