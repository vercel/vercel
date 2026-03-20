import chalk from 'chalk';
import type Client from '../../util/client';
import createVpcAccount from '../../util/vpc/create-account';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import { getCommandNamePlain } from '../../util/pkg-name';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import output from '../../output-manager';
import { VpcInitTelemetryClient } from '../../util/telemetry/commands/vpc/init';
import { initSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';

const DEFAULT_ROLE_NAME = 'VercelLambdaInvocationRole';
const VERCEL_AWS_PRINCIPAL_ARN =
  'arn:aws:iam::977805900156:user/aws-external-credentials-refresh-user-sfo1';

function generateTerraformTemplate(
  roleName: string,
  externalId: string,
  awsAccountId: string
): string {
  return `# Vercel Private Cloud — IAM Role for AWS Account ${awsAccountId}
#
# This Terraform configuration creates the IAM role that Vercel uses
# to invoke Lambda functions in your AWS account.
#
# Apply this configuration in your AWS account, then run:
#   vercel vpc connect --aws-account-id ${awsAccountId}

resource "aws_iam_role" "${roleName}" {
  name = "${roleName}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "${VERCEL_AWS_PRINCIPAL_ARN}"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "sts:ExternalId" = "${externalId}"
          }
        }
      }
    ]
  })

  inline_policy {
    name = "VercelLambdaInvocationPolicy"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Action = [
            "lambda:InvokeFunction",
            "lambda:GetFunction"
          ]
          Effect   = "Allow"
          Resource = "arn:aws:lambda:*:*:function:*"
        }
      ]
    })
  }

  tags = {
    VercelFunction = "true"
  }
}`;
}

export default async function init(client: Client, argv: string[]) {
  const telemetry = new VpcInitTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(initSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { flags } = parsedArgs;

  let awsAccountId = flags['--aws-account-id'] as string | undefined;
  let roleName = flags['--role-name'] as string | undefined;
  const externalId = flags['--external-id'] as string | undefined;

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
                'vpc init --aws-account-id <account-id>'
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

  // --- Collect Role Name (optional, defaults to VercelLambdaInvocationRole) ---
  if (!roleName) {
    if (!client.nonInteractive) {
      roleName = await client.input.text({
        message: `IAM Role Name (default: ${DEFAULT_ROLE_NAME}):`,
        default: DEFAULT_ROLE_NAME,
      });
    }
    if (!roleName) {
      roleName = DEFAULT_ROLE_NAME;
    }
  }

  // --- External ID is optional, auto-generated server-side if omitted ---

  telemetry.trackCliOptionAwsAccountId(awsAccountId);
  telemetry.trackCliOptionRoleName(roleName);
  telemetry.trackCliOptionExternalId(externalId);

  const { contextName, team } = await getScope(client);

  if (!team) {
    output.error(
      'VPC commands require a team scope. Use --scope or --team to specify a team.'
    );
    return 1;
  }

  const initStamp = stamp();

  if (!client.nonInteractive) {
    output.spinner(
      `Registering AWS account ${chalk.bold(awsAccountId)} under ${chalk.bold(contextName)}`
    );
  }

  try {
    const account = await createVpcAccount(client, team.id, {
      awsAccountId,
      roleName,
      externalId,
    });

    if (client.nonInteractive) {
      const terraform = generateTerraformTemplate(
        account.roleName,
        account.externalId,
        account.awsAccountId
      );
      const json = {
        status: AGENT_STATUS.OK,
        account: {
          awsAccountId: account.awsAccountId,
          roleName: account.roleName,
          externalId: account.externalId,
        },
        message: `AWS account ${account.awsAccountId} registered successfully.`,
        terraform,
        next: [
          {
            command: getCommandNamePlain(
              `vpc connect --aws-account-id ${account.awsAccountId}`
            ),
            when: 'After the IAM role has been created in AWS',
          },
        ],
      };
      client.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
      return 0;
    }

    output.stopSpinner();
    output.success(
      `AWS account ${chalk.bold(account.awsAccountId)} registered ${initStamp()}`
    );

    output.print('\n');
    output.print(chalk.bold('  Account Details\n\n'));
    output.print(
      `    ${chalk.cyan('AWS Account ID'.padEnd(18))}${account.awsAccountId}\n`
    );
    output.print(
      `    ${chalk.cyan('Role Name'.padEnd(18))}${account.roleName}\n`
    );
    output.print(
      `    ${chalk.cyan('External ID'.padEnd(18))}${account.externalId}\n`
    );

    output.print('\n');
    output.print(
      chalk.bold('  Next Step: Create the IAM role in your AWS account\n\n')
    );
    output.print(
      '  Apply the following Terraform configuration to create the IAM role:\n\n'
    );

    const terraform = generateTerraformTemplate(
      account.roleName,
      account.externalId,
      account.awsAccountId
    );

    for (const line of terraform.split('\n')) {
      output.print(`    ${line}\n`);
    }

    output.print('\n');
    output.log(
      `After applying the Terraform configuration, run ${chalk.bold(`vercel vpc connect --aws-account-id ${account.awsAccountId}`)} to verify the connection.`
    );
    output.print('\n');

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      if (client.nonInteractive) {
        const reason =
          err.status === 409
            ? 'account_already_exists'
            : AGENT_REASON.API_ERROR;
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason,
            message: err.message,
          },
          1
        );
        return 1;
      }
      if (err.status === 409) {
        output.error(
          `AWS account ${chalk.bold(awsAccountId)} is already registered for this team.`
        );
        return 1;
      }
      output.error(err.message);
      return 1;
    }
    throw err;
  }
}
