import ms from 'ms';
import chalk from 'chalk';

import cmd from '../util/output/cmd.ts';
import createOutput from '../util/output';
import logo from '../util/output/logo';
import stamp from '../util/output/stamp.ts';

import Now from '../util';
import getArgs from '../util/get-args';
import Client from '../util/client.ts';
import getScope from '../util/get-scope.ts';
import getDCsFromArgs from '../util/scale/get-dcs-from-args';
import getDeploymentByIdOrHost from '../util/deploy/get-deployment-by-id-or-host';
import getDeploymentByIdOrThrow from '../util/deploy/get-deployment-by-id-or-throw';
import getMaxFromArgs from '../util/scale/get-max-from-args';
import getMinFromArgs from '../util/scale/get-min-from-args';
import patchDeploymentScale from '../util/scale/patch-deployment-scale';
import waitVerifyDeploymentScale from '../util/scale/wait-verify-deployment-scale';
import { handleError } from '../util/error';
import {
  VerifyScaleTimeout,
  DeploymentTypeUnsupported,
} from '../util/errors-ts';
import {
  DeploymentNotFound,
  DeploymentPermissionDenied,
  ForbiddenScaleMaxInstances,
  ForbiddenScaleMinInstances,
  InvalidArgsForMinMaxScale,
  InvalidMaxForScale,
  InvalidMinForScale,
  InvalidScaleMinMaxRelation,
  NotSupportedMinScaleSlots,
} from '../util/errors-ts';
import { InvalidAllForScale, InvalidRegionOrDCForScale } from '../util/errors';
import handleCertError from '../util/certs/handle-cert-error';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now scale`)} <url> <dc> [min] [max]

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -d, --debug                    Debug mode [off]
    -S, --scope                    Set a custom scope
    -n, --no-verify                Skip step of waiting until instance count meets given constraints
    -t, --verify-timeout           How long to wait for verification to complete [5m]

  ${chalk.dim('Examples:')}

  ${chalk.gray(
    '–'
  )} Enable your deployment in all datacenters (min: 0, max: auto)

    ${chalk.cyan('$ now scale my-deployment-123.now.sh all')}

  ${chalk.gray(
    '-'
  )} Enable your deployment in the SFO datacenter (min: 0, max: auto)

    ${chalk.cyan('$ now scale my-deployment-123.now.sh sfo')}

  ${chalk.gray(
    '–'
  )} Scale a deployment in all datacenters to 3 instances at all times (no sleep)

    ${chalk.cyan('$ now scale my-deployment-123.now.sh all 3')}

  ${chalk.gray(
    '–'
  )} Enable your deployment in all datacenters, with auto-scaling

    ${chalk.cyan('$ now scale my-deployment-123.now.sh all auto')}
  `);
};

export default async function main(ctx) {
  let argv;

  try {
    argv = getArgs(ctx.argv.slice(2), {
      '--verify-timeout': Number,
      '--no-verify': Boolean,
      '-n': '--no-verify',
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  // Prepare the context
  const {
    authConfig: { token },
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = argv['--debug'];

  // $FlowFixMe
  const now = new Now({ apiUrl, token, debug, currentTeam });
  const output = createOutput({ debug });
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

  // Fail if the user is providing an old command
  if (argv._[1] === 'ls') {
    output.error(
      `${cmd('now scale ls')} has been deprecated. Use ${cmd(
        'now ls'
      )} and ${cmd('now inspect <url>')}`
    );
    now.close();
    return 1;
  }

  // Ensure the number of arguments is between the allower range
  if (argv._.length < 3 || argv._.length > 5) {
    output.error(
      `${cmd(
        'now scale <url> <dc> [min] [max]'
      )} expects at least two arguments`
    );
    help();
    now.close();
    return 1;
  }

  const dcs = getDCsFromArgs(argv._);
  if (dcs instanceof InvalidAllForScale) {
    output.error(
      'The region value "all" was used, but it cannot be used alongside other region or dc identifiers'
    );
    now.close();
    return 1;
  }
  if (dcs instanceof InvalidRegionOrDCForScale) {
    output.error(
      `The value "${dcs.meta.regionOrDC}" is not a valid region or DC identifier`
    );
    now.close();
    return 1;
  }

  const min = getMinFromArgs(argv._);
  if (min instanceof InvalidMinForScale) {
    output.error(
      `Invalid <min> parameter "${min.meta.value}". A number or "auto" were expected`
    );
    now.close();
    return 1;
  }

  const max = getMaxFromArgs(argv._);
  if (max instanceof InvalidMinForScale) {
    output.error(
      `Invalid <min> parameter "${max.meta.value}". A number or "auto" were expected`
    );
    now.close();
    return 1;
  }
  if (max instanceof InvalidArgsForMinMaxScale) {
    output.error(
      `Invalid number of arguments: expected <min> ("${max.meta.min}") and [max]`
    );
    now.close();
    return 1;
  }
  if (max instanceof InvalidMaxForScale) {
    output.error(
      `Invalid <max> parameter "${max.meta.value}". A number or "auto" were expected`
    );
    now.close();
    return 1;
  }

  // Fetch the deployment
  const deploymentStamp = stamp();
  const deployment = handleCertError(
    output,
    await getDeploymentByIdOrHost(now, contextName, argv._[1])
  );

  if (deployment === 1) {
    return deployment;
  }
  if (deployment instanceof DeploymentPermissionDenied) {
    output.error(
      `No permission to access deployment ${chalk.dim(
        deployment.meta.id
      )} under ${chalk.bold(deployment.meta.context)}`
    );
    now.close();
    return 1;
  }
  if (deployment instanceof DeploymentNotFound) {
    output.error(
      `Failed to find deployment "${argv._[1]}" in ${chalk.bold(contextName)}`
    );
    now.close();
    return 1;
  }

  output.log(`Fetched deployment "${deployment.url}" ${deploymentStamp()}`);

  // Make sure the deployment can be scaled
  if (deployment.type === 'STATIC') {
    output.error('Scaling rules cannot be set on static deployments');
    now.close();
    return 1;
  }
  if (deployment.state === 'ERROR') {
    output.error('Cannot scale a deployment in the ERROR state');
    now.close();
    return 1;
  }
  if (deployment.version === 2) {
    output.error('Cannot scale a Now 2.0 deployment');
    now.close();
    return 1;
  }

  const scaleArgs = dcs.reduce(
    (result, dc) => ({ ...result, [dc]: { min, max } }),
    {}
  );
  output.debug(
    `Setting scale deployment presets to ${JSON.stringify(scaleArgs)}`
  );

  // Set the deployment scale
  const scaleStamp = stamp();
  const result = await patchDeploymentScale(
    output,
    now,
    deployment.uid,
    scaleArgs,
    deployment.url
  );
  if (result instanceof ForbiddenScaleMinInstances) {
    output.error(
      `You can't scale to more than ${result.meta.max} min instances with your current plan.`
    );
    now.close();
    return 1;
  }
  if (result instanceof ForbiddenScaleMaxInstances) {
    output.error(
      `You can't scale to more than ${result.meta.max} max instances with your current plan.`
    );
    now.close();
    return 1;
  }
  if (result instanceof InvalidScaleMinMaxRelation) {
    output.error(`Min number of instances can't be higher than max.`);
    now.close();
    return 1;
  }
  if (result instanceof NotSupportedMinScaleSlots) {
    output.error(
      `Cloud v2 does not yet support setting a non-zero min number of instances.`
    );
    output.log('Read more: https://err.sh/now/v2-no-min');
    now.close();
    return 1;
  }
  if (result instanceof DeploymentTypeUnsupported) {
    output.error(`This region only accepts Serverless Docker Deployments.`);
    now.close();
    return 1;
  }

  console.log(
    `${chalk.gray('>')} Scale rules for ${dcs
      .map(d => chalk.bold(d))
      .join(', ')} (min: ${chalk.bold(min)}, max: ${chalk.bold(
      max
    )}) saved ${scaleStamp()}`
  );

  if (argv['--no-verify']) {
    now.close();
    return 0;
  }

  // Verify that the scale presets are there
  const verifyStamp = stamp();
  const updatedDeployment = await getDeploymentByIdOrThrow(
    now,
    contextName,
    deployment.uid
  );
  if (updatedDeployment.type === 'NPM' || updatedDeployment.type === 'DOCKER') {
    const result = await waitVerifyDeploymentScale(
      output,
      now,
      deployment.uid,
      updatedDeployment.scale
    );
    if (result instanceof VerifyScaleTimeout) {
      output.error(
        `Instance verification timed out (${ms(result.meta.timeout)})`,
        'verification-timeout'
      );
      now.close();
      return 1;
    }
    output.success(`Scale state verified ${verifyStamp()}`);
  }

  now.close();
  return 0;
}
