import { packageName } from '../../util/pkg-name';

export const initSubcommand = {
  name: 'init',
  aliases: [],
  description:
    'Register an AWS account for Bring Your Own Cloud by providing your AWS Account ID',
  arguments: [],
  options: [
    {
      name: 'aws-account-id',
      shorthand: null,
      type: String,
      argument: 'ACCOUNT_ID',
      deprecated: false,
      description: 'AWS Account ID (12 digits)',
    },
    {
      name: 'role-name',
      shorthand: null,
      type: String,
      argument: 'ROLE_NAME',
      deprecated: false,
      description: 'IAM Role Name (default: VercelLambdaInvocationRole)',
    },
    {
      name: 'external-id',
      shorthand: null,
      type: String,
      argument: 'EXTERNAL_ID',
      deprecated: false,
      description:
        'External ID for the IAM trust policy (auto-generated if omitted)',
    },
  ],
  examples: [
    {
      name: 'Initialize a BYOC connection with an AWS account',
      value: `${packageName} byoc init --aws-account-id 123456789012`,
    },
    {
      name: 'Initialize with a custom role name and external ID',
      value: `${packageName} byoc init --aws-account-id 123456789012 --role-name MyRole --external-id my-external-id`,
    },
  ],
} as const;

export const connectSubcommand = {
  name: 'connect',
  aliases: [],
  description:
    'Verify the AWS account connection by refreshing credentials via STS AssumeRole',
  arguments: [],
  options: [
    {
      name: 'aws-account-id',
      shorthand: null,
      type: String,
      argument: 'ACCOUNT_ID',
      deprecated: false,
      description: 'AWS Account ID (12 digits) to connect',
    },
  ],
  examples: [
    {
      name: 'Verify connection to a registered AWS account',
      value: `${packageName} byoc connect --aws-account-id 123456789012`,
    },
  ],
} as const;

export const byocCommand = {
  name: 'byoc',
  aliases: [],
  description: 'Manage Bring Your Own Cloud AWS account connections',
  arguments: [],
  subcommands: [initSubcommand, connectSubcommand],
  options: [],
  examples: [
    {
      name: 'Initialize a BYOC connection',
      value: `${packageName} byoc init --aws-account-id 123456789012`,
    },
    {
      name: 'Verify a BYOC connection',
      value: `${packageName} byoc connect --aws-account-id 123456789012`,
    },
  ],
} as const;
