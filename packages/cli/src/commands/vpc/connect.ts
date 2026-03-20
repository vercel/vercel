import chalk from 'chalk';
import type Client from '../../util/client';
import refreshVpcAccount from '../../util/vpc/refresh-account';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import { getCommandNamePlain } from '../../util/pkg-name';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import output from '../../output-manager';
import { VpcConnectTelemetryClient } from '../../util/telemetry/commands/vpc/connect';
import { connectSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';

export default async function connect(client: Client, argv: string[]) {
  const telemetry = new VpcConnectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(connectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { flags } = parsedArgs;

  let awsAccountId = flags['--aws-account-id'] as string | undefined;

  // --- Collect AWS Account ID ---
  if (!awsAccountId) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message:
            'AWS Account ID is required. Provide it with --aws-account-id.',
          next: [
            {
              command: getCommandNamePlain(
                'vpc connect --aws-account-id <account-id>'
              ),
            },
          ],
        },
        1
      );
      return 1;
    }
    awsAccountId = await client.input.text({
      message: 'AWS Account ID (12 digits):',
      validate: (val: string) => {
        if (!val) {
          return 'AWS Account ID is required';
        }
        if (!/^[0-9]{12}$/.test(val)) {
          return 'AWS Account ID must be exactly 12 digits';
        }
        return true;
      },
    });
  } else {
    if (!/^[0-9]{12}$/.test(awsAccountId)) {
      output.error('AWS Account ID must be exactly 12 digits.');
      return 1;
    }
  }

  telemetry.trackCliOptionAwsAccountId(awsAccountId);

  const { contextName, team } = await getScope(client);

  if (!team) {
    output.error(
      'VPC commands require a team scope. Use --scope or --team to specify a team.'
    );
    return 1;
  }

  const connectStamp = stamp();

  if (!client.nonInteractive) {
    output.spinner(
      `Verifying connection to AWS account ${chalk.bold(awsAccountId)} under ${chalk.bold(contextName)}`
    );
  }

  try {
    const account = await refreshVpcAccount(client, team.id, awsAccountId);

    if (client.nonInteractive) {
      const json = {
        status: AGENT_STATUS.OK,
        account: {
          awsAccountId: account.awsAccountId,
          roleName: account.roleName,
          externalId: account.externalId,
          credentialsExpiresAt: account.credentialsExpiresAt,
        },
        message: `Connection to AWS account ${account.awsAccountId} verified successfully.`,
      };
      client.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
      return 0;
    }

    output.stopSpinner();
    output.success(
      `Connection to AWS account ${chalk.bold(account.awsAccountId)} verified ${connectStamp()}`
    );

    output.print('\n');
    output.print(chalk.bold('  Connection Details\n\n'));
    output.print(
      `    ${chalk.cyan('AWS Account ID'.padEnd(22))}${account.awsAccountId}\n`
    );
    output.print(
      `    ${chalk.cyan('Role Name'.padEnd(22))}${account.roleName}\n`
    );
    output.print(
      `    ${chalk.cyan('Credentials Expire'.padEnd(22))}${account.credentialsExpiresAt ?? 'N/A'}\n`
    );
    output.print('\n');

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      if (client.nonInteractive) {
        const reason =
          err.status === 404
            ? AGENT_REASON.NOT_FOUND
            : err.code === 'assume_role_failed'
              ? 'assume_role_failed'
              : AGENT_REASON.API_ERROR;
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason,
            message: err.message,
            hint:
              reason === 'assume_role_failed'
                ? 'Verify that the IAM trust policy is correctly configured with the right External ID and principal ARN.'
                : undefined,
          },
          1
        );
        return 1;
      }
      if (err.status === 404) {
        output.error(
          `AWS account ${chalk.bold(awsAccountId)} is not registered. Run ${chalk.bold(`vercel vpc init --aws-account-id ${awsAccountId}`)} first.`
        );
        return 1;
      }
      if (err.code === 'assume_role_failed') {
        output.error(
          `Failed to assume role for AWS account ${chalk.bold(awsAccountId)}.`
        );
        output.log(
          'Verify that the IAM trust policy is correctly configured with the right External ID and principal ARN.'
        );
        return 1;
      }
      output.error(err.message);
      return 1;
    }
    throw err;
  }
}
