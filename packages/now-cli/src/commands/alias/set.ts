import ms from 'ms';
import chalk from 'chalk';
import { SetDifference } from 'utility-types';
import { AliasRecord } from '../../util/alias/create-alias';
import { NowContext, Domain } from '../../types';
import { Output } from '../../util/output';
import * as ERRORS from '../../util/errors-ts';
import assignAlias from '../../util/alias/assign-alias';
import Client from '../../util/client';
import cmd from '../../util/output/cmd';
import formatDnsTable from '../../util/format-dns-table';
import formatNSTable from '../../util/format-ns-table';
import getDeploymentForAlias from '../../util/alias/get-deployment-for-alias';
import getRulesFromFile from '../../util/alias/get-rules-from-file';
import getScope from '../../util/get-scope';
import { getTargetsForAlias } from '../../util/alias/get-targets-for-alias';
import humanizePath from '../../util/humanize-path';
import setupDomain from '../../util/domains/setup-domain';
import stamp from '../../util/output/stamp';
import { isValidName } from '../../util/is-valid-name';
import upsertPathAlias from '../../util/alias/upsert-path-alias';
import handleCertError from '../../util/certs/handle-cert-error';
import isWildcardAlias from '../../util/alias/is-wildcard-alias';
import link from '../../util/output/link';
import { User } from '../../types';
import { getPkgName } from '../../util/pkg-name';

type Options = {
  '--debug': boolean;
  '--local-config': string;
  '--no-verify': boolean;
  '--rules': string;
};

export default async function set(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const {
    authConfig: { token },
    config,
    localConfig,
  } = ctx;

  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const setStamp = stamp();

  const {
    '--debug': debugEnabled,
    '--no-verify': noVerify,
    '--rules': rulesPath,
  } = opts;

  const client = new Client({
    apiUrl,
    token,
    currentTeam,
    debug: debugEnabled,
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
      `${cmd(
        `${getPkgName()} alias <deployment> <target>`
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

  // Read the path alias rules in case there is is given
  const rules = await getRulesFromFile(rulesPath);
  if (rules instanceof ERRORS.FileNotFound) {
    output.error(`Can't find the provided rules file at location:`);
    output.print(`  ${chalk.gray('-')} ${rules.meta.file}\n`);
    return 1;
  }

  if (rules instanceof ERRORS.CantParseJSONFile) {
    output.error(`Error parsing provided rules.json file at location:`);
    output.print(`  ${chalk.gray('-')} ${rules.meta.file}\n`);
    return 1;
  }

  if (rules instanceof ERRORS.RulesFileValidationError) {
    output.error(`Path Alias validation error: ${rules.meta.message}`);
    output.print(`  ${chalk.gray('-')} ${rules.meta.location}\n`);
    return 1;
  }

  // If the user provided rules and also a deployment target, we should fail
  if (args.length === 2 && rules) {
    output.error(
      `You can't supply a deployment target and target rules simultaneously.`
    );
    return 1;
  }

  if (args.length === 0 && !rules) {
    output.error(
      `To ship to production, optionally configure your domains (${link(
        'https://vercel.com/docs/v2/custom-domains'
      )}) and run ${cmd(`${getPkgName()} --prod`)}.`
    );
    return 1;
  }

  // Find the targets to perform the alias
  const targets = getTargetsForAlias(args, localConfig);

  if (targets instanceof ERRORS.NoAliasInConfig) {
    output.error(`Couldn't find an alias in config`);
    return 1;
  }

  if (targets instanceof ERRORS.InvalidAliasInConfig) {
    output.error(
      `Wrong value for alias found in config. It must be a string or array of string.`
    );
    return 1;
  }

  if (rules) {
    // If we have rules for path alias we assign them to the domain
    for (const target of targets) {
      output.log(
        `Assigning path alias rules from ${humanizePath(
          rulesPath
        )} to ${target}`
      );
      const pathAlias = await upsertPathAlias(
        output,
        client,
        rules,
        target,
        contextName
      );
      const remaining = handleCreateAliasError(output, pathAlias);
      if (handleSetupDomainError(output, remaining) !== 1) {
        console.log(
          `${chalk.cyan('> Success!')} ${
            rules.length
          } rules configured for ${chalk.underline(target)} ${setStamp()}`
        );
      }
    }

    return 0;
  }

  // If there are no rules for path alias we should find out a deployment and perform the alias

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

  // Assign the alias for each of the targets in the array
  for (const target of targets) {
    output.log(`Assigning alias ${target} to deployment ${deployment.url}`);

    const isWildcard = isWildcardAlias(target);
    const record = await assignAlias(
      output,
      client,
      deployment,
      target,
      contextName,
      noVerify
    );
    const handleResult = handleSetupDomainError(
      output,
      handleCreateAliasError(output, record),
      isWildcard
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
  }

  return 0;
}

type ThenArg<T> = T extends Promise<infer U> ? U : T;
type SetupDomainResolve = ThenArg<ReturnType<typeof setupDomain>>;
type SetupDomainError = Exclude<SetupDomainResolve, Domain>;

function handleSetupDomainError<T>(
  output: Output,
  error: SetupDomainError | T,
  isWildcard: boolean = false
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
      `  ${chalk.gray(
        'a)'
      )} Nameservers verification failed since we see a different set than the intended set:`
    );
    output.print(
      `\n${formatNSTable(
        nsVerification.intendedNameservers,
        nsVerification.nameservers,
        { extraSpace: '     ' }
      )}\n\n`
    );
    if (error instanceof ERRORS.DomainVerificationFailed && !isWildcard) {
      const { txtVerification } = error.meta;
      output.print(
        `  ${chalk.gray(
          'b)'
        )} DNS TXT verification failed since found no matching records.`
      );
      output.print(
        `\n${formatDnsTable(
          [['_now', 'TXT', txtVerification.verificationRecord]],
          { extraSpace: '     ' }
        )}\n\n`
      );
      output.print(
        `  Once your domain uses either the nameservers or the TXT DNS record from above, run again ${cmd(
          `${getPkgName()} domains verify <domain>`
        )}.\n`
      );
      output.print(
        `  We will also periodically run a verification check for you and you will receive an email once your domain is verified.\n`
      );
    } else {
      output.print(
        `  Once your domain uses the nameservers from above, run again ${cmd(
          `${getPkgName()} domains verify <domain>`
        )}.\n`
      );
    }
    output.print('  Read more: https://err.sh/now/domain-verification\n');
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
      `Invalid alias. Please confirm that the alias you provided is a valid hostname. Note: For \`now.sh\`, only sub and sub-sub domains are supported.`
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

  if (error instanceof ERRORS.RuleValidationFailed) {
    output.error(`Rule validation error: ${error.meta.message}.`);
    output.print(`  Make sure your rules file is written correctly.\n`);
    return 1;
  }
  if (error instanceof ERRORS.VerifyScaleTimeout) {
    output.error(`Instance verification timed out (${ms(error.meta.timeout)})`);
    output.log('Read more: https://err.sh/now/verification-timeout');
    return 1;
  }
  if (error instanceof ERRORS.NotSupportedMinScaleSlots) {
    output.error(
      `Scale rules from previous aliased deployment ${chalk.dim(
        error.meta.url
      )} could not be copied since Cloud v2 deployments cannot have a non-zero min`
    );
    output.log(
      `Update the scale settings on ${chalk.dim(
        error.meta.url
      )} with \`${getPkgName()} scale\` and try again`
    );
    output.log('Read more: https://err.sh/now/v2-no-min');
    return 1;
  }
  if (error instanceof ERRORS.ForbiddenScaleMaxInstances) {
    output.error(
      `Scale rules from previous aliased deployment ${chalk.dim(
        error.meta.url
      )} could not be copied since the given number of max instances (${
        error.meta.max
      }) is not allowed.`
    );
    output.log(
      `Update the scale settings on ${chalk.dim(
        error.meta.url
      )} with \`${getPkgName()} scale\` and try again`
    );
    return 1;
  }
  if (error instanceof ERRORS.ForbiddenScaleMinInstances) {
    output.error(
      `You can't scale to more than ${error.meta.max} min instances with your current plan.`
    );
    return 1;
  }

  if (error instanceof ERRORS.InvalidScaleMinMaxRelation) {
    output.error(
      `Scale rules from previous aliased deployment ${chalk.dim(
        error.meta.url
      )} could not be copied becuase the relation between min and max instances is wrong.`
    );
    output.log(
      `Update the scale settings on ${chalk.dim(
        error.meta.url
      )} with \`${getPkgName()} scale\` and try again`
    );
    return 1;
  }

  if (error instanceof ERRORS.CertMissing) {
    output.error(
      `There is no certificate for the domain ${error.meta.domain} and it could not be created.`
    );
    output.log(
      `Please generate a new certificate manually with ${cmd(
        `${getPkgName()} certs issue ${error.meta.domain}`
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
