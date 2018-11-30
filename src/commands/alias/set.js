//      
import ms from 'ms';
import chalk from 'chalk';


import * as Errors from '../../util/errors';
import cmd from '../../util/output/cmd';
import dnsTable from '../../util/dns-table';
import getScope from '../../util/get-scope';
import humanizePath from '../../util/humanize-path';
import Now from '../../util';
import stamp from '../../util/output/stamp';
import zeitWorldTable from '../../util/zeit-world-table';
                                                        

import assignAlias from './assign-alias';
import getDeploymentForAlias from './get-deployment-for-alias';
import getRulesFromFile from './get-rules-from-file';
import getTargetsForAlias from './get-targets-for-alias';
import upsertPathAlias from './upsert-path-alias';

export default async function set(
  ctx            ,
  opts                 ,
  args          ,
  output        
)                  {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const setStamp = stamp();

  const {
    '--debug': debugEnabled,
    '--no-verify': noVerify,
    '--rules': rulesPath
  } = opts;

  const { contextName, user } = await getScope({
    apiUrl,
    token,
    debug: debugEnabled,
    currentTeam,
    required: new Set(['user'])
  });

  // $FlowFixMe
  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam });

  // If there are more than two args we have to error
  if (args.length > 2) {
    output.error(
      `${cmd('now alias <deployment> <target>')} accepts at most two arguments`
    );
    return 1;
  }

  // Read the path alias rules in case there is is given
  const rules = await getRulesFromFile(rulesPath);
  if (rules instanceof Errors.FileNotFound) {
    output.error(`Can't find the provided rules file at location:`);
    output.print(`  ${chalk.gray('-')} ${rules.meta.file}\n`);
    return 1;
  } if (rules instanceof Errors.CantParseJSONFile) {
    output.error(`Error parsing provided rules.json file at location:`);
    output.print(`  ${chalk.gray('-')} ${rules.meta.file}\n`);
    return 1;
  } if (rules instanceof Errors.RulesFileValidationError) {
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

  // Find the targets to perform the alias
  const targets = await getTargetsForAlias(
    output,
    args,
    opts['--local-config']
  );
  if (targets instanceof Errors.CantFindConfig) {
    output.error(
      `Couldn't find a project configuration file at \n    ${targets.meta.paths.join(
        ' or\n    '
      )}`
    );
    return 1;
  } if (targets instanceof Errors.NoAliasInConfig) {
    output.error(`Couldn't find a an alias in config`);
    return 1;
  } if (targets instanceof Errors.InvalidAliasInConfig) {
    output.error(
      `Wrong value for alias found in config. It must be a string or array of string.`
    );
    return 1;
  } if (targets instanceof Errors.CantParseJSONFile) {
    output.error(`Couldn't parse JSON file ${targets.meta.file}.`);
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
        now,
        rules,
        target,
        contextName
      );
      if (
        handleSetupDomainErrorImpl(
          output,
          handleCreateAliasErrorImpl(output, pathAlias)
        ) !== 1
      ) {
        console.log(
          `${chalk.cyan(
            '> Success!'
          )} ${rules.length} rules configured for ${chalk.underline(
            target
          )} ${setStamp()}`
        );
      }
    }
  } else {
    // If there are no rules for path alias we should find out a deployment and perform the alias
    const deployment = await getDeploymentForAlias(
      now,
      output,
      args,
      opts['--local-config'],
      user,
      contextName
    );
    if (deployment instanceof Errors.DeploymentNotFound) {
      output.error(
        `Failed to find deployment "${deployment.meta.id}" under ${chalk.bold(
          contextName
        )}`
      );
      return 1;
    } if (deployment instanceof Errors.DeploymentPermissionDenied) {
      output.error(
        `No permission to access deployment "${deployment.meta
          .id}" under ${chalk.bold(deployment.meta.context)}`
      );
      return 1;
    } if (deployment === null) {
      output.error(
        `Couldn't find a deployment to alias. Please provide one as an argument.`
      );
      return 1;
    }

    // Assign the alias for each of the targets in the array
    for (const target of targets) {
      output.log(`Assigning alias ${target} to deployment ${deployment.url}`);
      const record = await assignAlias(
        output,
        now,
        deployment,
        target,
        contextName,
        noVerify
      );
      const handleResult = handleSetupDomainErrorImpl(
        output,
        handleCreateAliasErrorImpl(output, record)
      );
      if (handleResult !== 1) {
        console.log(
          `${chalk.cyan(
            '> Success!'
          )} ${handleResult.alias} now points to ${chalk.bold(
            deployment.url
          )} ${setStamp()}`
        );
      }
    }
  }

  return 0;
}

                              
                                    
                         
                            
                                 
                                   
                        
                            
                          
                                
                         
                     
                       

function handleSetupDomainErrorImpl       (
  output        ,
  error                          
)            {
  if (error instanceof Errors.DomainVerificationFailed) {
    output.error(
      `We couldn't verify the domain ${chalk.underline(error.meta.domain)}.\n`
    );
    output.print(
      `  Please make sure that your nameservers point to ${chalk.underline(
        'zeit.world'
      )}.\n`
    );
    output.print(
      `  Examples: (full list at ${chalk.underline('https://zeit.world')})\n`
    );
    output.print(`${zeitWorldTable()  }\n`);
    output.print(
      `\n  As an alternative, you can add following records to your DNS settings:\n`
    );
    output.print(
      `${dnsTable(
        [
          ['_now', 'TXT', error.meta.token],
          error.meta.subdomain === null
            ? ['', 'ALIAS', 'alias.zeit.co']
            : [error.meta.subdomain, 'CNAME', 'alias.zeit.co']
        ],
        { extraSpace: '  ' }
      )  }\n`
    );
    return 1;
  } if (error instanceof Errors.DomainPermissionDenied) {
    output.error(
      `You don't have permissions over domain ${chalk.underline(
        error.meta.domain
      )} under ${chalk.bold(error.meta.context)}.`
    );
    return 1;
  } if (error instanceof Errors.PaymentSourceNotFound) {
    output.error(
      `No credit cards found to buy the domain. Please run ${cmd(
        'now cc add'
      )}.`
    );
    return 1;
  } if (error instanceof Errors.CDNNeedsUpgrade) {
    output.error(`You can't add domains with CDN enabled from an OSS plan`);
    return 1;
  } if (error instanceof Errors.DomainNotVerified) {
    output.error(
      `We couldn't verify the domain ${chalk.underline(
        error.meta.domain
      )}. If it's an external domain, add it with --external.`
    );
    return 1;
  } if (error instanceof Errors.DomainNameserversNotFound) {
    output.error(
      `Couldn't find nameservers for the domain ${chalk.underline(
        error.meta.domain
      )}`
    );
    return 1;
  } if (error instanceof Errors.UserAborted) {
    output.error(`User aborted`);
    return 1;
  } if (error instanceof Errors.DomainNotFound) {
    output.error(`You should buy the domain before aliasing.`);
    return 1;
  } if (error instanceof Errors.InvalidCoupon) {
    output.error(`The provided coupon ${error.meta.coupon} is invalid.`);
    return 1;
  } if (error instanceof Errors.MissingCreditCard) {
    output.print(
      'You have no credit cards on file. Please add one to purchase the domain.'
    );
    return 1;
  } if (error instanceof Errors.UnsupportedTLD) {
    output.error(
      `The TLD for domain name ${error.meta.name} is not supported.`
    );
    return 1;
  } if (error instanceof Errors.UsedCoupon) {
    output.error(`The provided coupon ${error.meta.coupon} can't be used.`);
    return 1;
  } 
    return error;
  
}

                       
                     
                             
                          
                             
                                     
                                   
                                 
                                 
                                  
                                     
                                     
                       
                                     
                                
                                    
                               
                              
                          
                              

function handleCreateAliasErrorImpl            (
  output        ,
  error                               
)                 {
  if (error instanceof Errors.AliasInUse) {
    output.error(
      `The alias ${chalk.dim(
        error.meta.alias
      )} is a deployment URL or it's in use by a different team.`
    );
    return 1;
  } if (error instanceof Errors.DeploymentNotFound) {
    output.error(
      `Failed to find deployment ${chalk.dim(error.meta.id)} under ${chalk.bold(
        error.meta.context
      )}`
    );
    return 1;
  } if (error instanceof Errors.InvalidAlias) {
    output.error(
      `Invalid alias. Please confirm that the alias you provided is a valid hostname. Note: Nested domains are not supported.`
    );
    return 1;
  } if (error instanceof Errors.DomainPermissionDenied) {
    output.error(
      `No permission to access domain ${chalk.underline(
        error.meta.domain
      )} under ${chalk.bold(error.meta.context)}`
    );
    return 1;
  } if (error instanceof Errors.DeploymentPermissionDenied) {
    output.error(
      `No permission to access deployment ${chalk.dim(
        error.meta.id
      )} under ${chalk.bold(error.meta.context)}`
    );
    return 1;
  } if (error instanceof Errors.CDNNeedsUpgrade) {
    output.error(`You can't add domains with CDN enabled from an OSS plan.`);
    return 1;
  } if (error instanceof Errors.DomainConfigurationError) {
    output.error(
      `We couldn't verify the propagation of the DNS settings for ${chalk.underline(
        error.meta.domain
      )}`
    );
    if (error.meta.external) {
      output.print(
        `  The propagation may take a few minutes, but please verify your settings:\n\n`
      );
      output.print(
        `${dnsTable([
          error.meta.subdomain === null
            ? ['', 'ALIAS', 'alias.zeit.co']
            : [error.meta.subdomain, 'CNAME', 'alias.zeit.co']
        ])  }\n`
      );
    } else {
      output.print(
        `  We configured them for you, but the propagation may take a few minutes.\n`
      );
      output.print(`  Please try again later.\n`);
    }
    return 1;
  } if (error instanceof Errors.TooManyCertificates) {
    output.error(
      `Too many certificates already issued for exact set of domains: ${error.meta.domains.join(
        ', '
      )}`
    );
    return 1;
  } if (error instanceof Errors.CantSolveChallenge) {
    if (error.meta.type === 'dns-01') {
      output.error(
        `The certificate provider could not resolve the DNS queries for ${error
          .meta.domain}.`
      );
      output.print(
        `  This might happen to new domains or domains with recent DNS changes. Please retry later.\n`
      );
    } else {
      output.error(
        `The certificate provider could not resolve the HTTP queries for ${error
          .meta.domain}.`
      );
      output.print(
        `  The DNS propagation may take a few minutes, please verify your settings:\n\n`
      );
      output.print(`${dnsTable([['', 'ALIAS', 'alias.zeit.co']])  }\n`);
    }
    return 1;
  } if (error instanceof Errors.DomainValidationRunning) {
    output.error(
      `There is a validation in course for ${chalk.underline(
        error.meta.domain
      )}. Wait until it finishes.`
    );
    return 1;
  } if (error instanceof Errors.RuleValidationFailed) {
    output.error(`Rule validation error: ${error.meta.message}.`);
    output.print(`  Make sure your rules file is written correctly.\n`);
    return 1;
  } if (error instanceof Errors.TooManyRequests) {
    output.error(
      `Too many requests detected for ${error.meta
        .api} API. Try again in ${ms(error.meta.retryAfter * 1000, {
        long: true
      })}.`
    );
    return 1;
  } if (error instanceof Errors.VerifyScaleTimeout) {
    output.error(`Instance verification timed out (${ms(error.meta.timeout)})`);
    output.log('Read more: https://err.sh/now-cli/verification-timeout');
    return 1;
  } if (error instanceof Errors.InvalidWildcardDomain) {
    output.error(
      `Invalid domain ${chalk.underline(
        error.meta.domain
      )}. Wildcard domains can only be followed by a root domain.`
    );
    return 1;
  } if (error instanceof Errors.DomainsShouldShareRoot) {
    output.error(`All given common names should share the same root domain.`);
    return 1;
  } if (error instanceof Errors.NotSupportedMinScaleSlots) {
    output.error(
      `Scale rules from previous aliased deployment ${chalk.dim(
        error.meta.url
      )} could not be copied since Cloud v2 deployments cannot have a non-zero min`
    );
    output.log(
      `Update the scale settings on ${chalk.dim(
        error.meta.url
      )} with \`now scale\` and try again`
    );
    output.log('Read more: https://err.sh/now-cli/v2-no-min');
    return 1;
  } if (error instanceof Errors.ForbiddenScaleMaxInstances) {
    output.error(
      `Scale rules from previous aliased deployment ${chalk.dim(
        error.meta.url
      )} could not be copied since the given number of max instances (${error
        .meta.max}) is not allowed.`
    );
    output.log(
      `Update the scale settings on ${chalk.dim(
        error.meta.url
      )} with \`now scale\` and try again`
    );
    return 1;
  } if (error instanceof Errors.ForbiddenScaleMinInstances) {
    output.error(
      `Scale rules from previous aliased deployment ${chalk.dim(
        error.meta.url
      )} could not be copied since the given number of min instances (${error
        .meta.min}) is not allowed.`
    );
    output.log(
      `Update the scale settings on ${chalk.dim(
        error.meta.url
      )} with \`now scale\` and try again`
    );
    return 1;
  } if (error instanceof Errors.InvalidScaleMinMaxRelation) {
    output.error(
      `Scale rules from previous aliased deployment ${chalk.dim(
        error.meta.url
      )} could not be copied becuase the relation between min and max instances is wrong.`
    );
    output.log(
      `Update the scale settings on ${chalk.dim(
        error.meta.url
      )} with \`now scale\` and try again`
    );
    return 1;
  } 
    return error;
  
}
