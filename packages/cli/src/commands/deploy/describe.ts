import type Client from '../../util/client';
import { DescribeError } from '../../util/describe/error';
import { DescribeTelemetryClient } from '../../util/telemetry/commands/deploy/describe';
import { InvalidToken, isAPIError } from '../../util/errors-ts';
import { describeSubcommand } from './command';
import { describeDeployment } from '../../util/describe';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { isArgumentError, parseArguments } from '../../util/get-args';
import { join } from 'node:path';
import { quoteArg } from '../../util/flags/quote-arg';
import { resolveDescribeProject } from '../../util/describe/resolve-project';
import { wantsMachineReadableOutput } from '../../util/output-format';
import output from '../../output-manager';
import {
  type DeprecatedOptionWarning,
  getRenamedOption,
} from '../../util/renamed-option';

export default async function describe(client: Client): Promise<number> {
  let asJson = wantsMachineReadableOutput('deploy', client.argv);
  let warnings: DeprecatedOptionWarning[] = [];
  const fail = (reason: string, message: string, code = 1) => {
    if (asJson) {
      client.stderr.write(
        `${JSON.stringify({
          status: 'error',
          reason,
          message,
          ...(warnings.length > 0 ? { warnings } : {}),
        })}\n`
      );
    } else {
      output.error(message);
    }
    return code;
  };

  let parsed;
  try {
    parsed = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(describeSubcommand.options)
    );
  } catch (error) {
    return fail(
      'invalid_arguments',
      `${isArgumentError(error) ? error.message : 'Invalid describe options'}. Run \`vercel deploy describe --help\` for usage.`,
      2
    );
  }

  asJson = parsed.flags['--json'] === true;
  const deployment = getRenamedOption(parsed.flags, '--deployment', '--id', {
    json: asJson,
  });
  if ('error' in deployment) {
    return fail('invalid_arguments', deployment.error, 2);
  }
  if (deployment.warning) {
    warnings = [deployment.warning];
  }
  const deploymentId = deployment.value;
  const awsAccountId = parsed.flags['--aws-account-id'];
  // Positionals start with the subcommand, after `deploy` when it was typed.
  const subArgs =
    parsed.args[0] === 'deploy' ? parsed.args.slice(1) : parsed.args;
  if (subArgs.length > 1) {
    return fail(
      'invalid_arguments',
      'Unexpected positional arguments. Run `vercel deploy describe --help` for usage.',
      2
    );
  }
  if (!deploymentId || !/^dpl_[a-zA-Z0-9]+$/.test(deploymentId)) {
    return fail(
      'invalid_arguments',
      'Provide a deployment ID with --deployment, such as --deployment dpl_xxx.',
      2
    );
  }
  if (!awsAccountId || !/^\d{12}$/.test(awsAccountId)) {
    return fail(
      'invalid_arguments',
      'Provide a 12-digit AWS account ID with --aws-account-id.',
      2
    );
  }

  // The vendored Build Container helpers key function files with native path
  // separators, which would produce broken ZIPs on Windows.
  if (process.platform === 'win32') {
    return fail(
      'unsupported_platform',
      'vercel deploy describe is not supported on Windows yet. Run it on macOS or Linux.'
    );
  }

  const telemetry = new DescribeTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  telemetry.trackCliOptionDeployment(parsed.flags['--deployment']);
  telemetry.trackCliOptionId(parsed.flags['--id']);
  telemetry.trackCliOptionAwsAccountId(awsAccountId);
  telemetry.trackCliFlagJson(parsed.flags['--json']);

  try {
    const project = await resolveDescribeProject(client);
    const explicitTeam = parsed.flags['--scope']
      ? client.config.currentTeam
      : process.env.VERCEL_ORG_ID;
    if (explicitTeam && explicitTeam !== project.orgId) {
      return fail(
        'scope_mismatch',
        'The selected team does not match the local project link. Use the linked team, or run `vercel pull --yes` with the intended VERCEL_ORG_ID and VERCEL_PROJECT_ID.'
      );
    }
    if (
      process.env.VERCEL_PROJECT_ID &&
      process.env.VERCEL_PROJECT_ID !== project.projectId
    ) {
      return fail(
        'project_mismatch',
        'VERCEL_PROJECT_ID differs from the linked project. Run `vercel pull --yes` to restore settings for the intended project.'
      );
    }

    // The env pull helper shared with `build --deployment` scopes requests with the
    // current team, so point it at the linked team.
    client.config.currentTeam = project.orgId.startsWith('team_')
      ? project.orgId
      : undefined;

    if (!asJson) {
      output.log(
        `Preparing ${deploymentId} in team ${project.orgId} for AWS account ${awsAccountId}`
      );
    }
    const directory = await describeDeployment(client, {
      directory: project.directory,
      repoRootPath: project.repoRootPath,
      deploymentId,
      awsAccountId,
      teamId: project.orgId,
      quiet: asJson,
    });
    const descriptor = join(directory, 'descriptor.json');
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify({
          deployment: { id: deploymentId },
          awsAccountId,
          directory,
          descriptor,
          ...(warnings.length > 0 ? { warnings } : {}),
        })}\n`
      );
    } else {
      client.stdout.write(`${descriptor}\n`);
      output.log(`Prepared function packages in ${directory}`);
      const cwd =
        project.directory === client.cwd
          ? ''
          : ` --cwd ${quoteArg(project.directory)}`;
      output.log(
        `Provision the functions in descriptor.json, then run:\n  vercel deploy continue --deployment ${deploymentId}${cwd}`
      );
    }
    return 0;
  } catch (error) {
    output.debug(
      error instanceof Error ? (error.stack ?? error.message) : String(error)
    );
    if (error instanceof DescribeError) {
      return fail(error.reason, error.message);
    }
    if (
      error instanceof InvalidToken ||
      (isAPIError(error) && error.status === 401)
    ) {
      return fail(
        'not_authorized',
        'Could not authenticate with Vercel. Check VERCEL_TOKEN in CI, or run `vercel login`.'
      );
    }
    if (isAPIError(error) && error.status === 403) {
      return fail(
        'not_authorized',
        'Vercel denied access to this deployment. Check that your token has access to the linked project and team.'
      );
    }
    if (isAPIError(error) && error.status === 404) {
      return fail(
        'not_found',
        `Deployment ${deploymentId} was not found, or manual provisioning is not enabled for this team.`
      );
    }
    if (isAPIError(error) && error.status < 500 && error.serverMessage) {
      return fail('api_error', error.serverMessage);
    }
    return fail(
      'describe_failed',
      'Could not prepare deployment functions. Check the local build and deployment access, then rerun this command.'
    );
  }
}
