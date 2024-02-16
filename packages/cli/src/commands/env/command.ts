import { Command } from '../help';
import { packageName } from '../../util/pkg-name';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';

const targetPlaceholder = getEnvTargetPlaceholder();

export const envCommand: Command = {
  name: 'env',
  description: 'Interact with environment variables.',
  arguments: [
    {
      name: 'command',
      required: false,
    },
  ],
  subcommands: [
    {
      name: 'ls',
      description: 'List all variables for the specified Environment',
      arguments: [],
      options: [],
      examples: [],
    },
    {
      name: 'add',
      description: 'Add an Environment Variable (see examples below)',
      arguments: [
        {
          name: 'name',
          required: true,
        },
        {
          name: 'environment',
          required: false,
        },
      ],
      options: [
        {
          name: 'sensitive',
          description: 'Add a sensitive Environment Variable',
          shorthand: null,
          type: 'string',
          deprecated: false,
          multi: false,
        },
      ],
      examples: [],
    },
    {
      name: 'rm',
      description: 'Remove an Environment Variable (see examples below)',
      arguments: [
        {
          name: 'name',
          required: true,
        },
        {
          name: 'environment',
          required: false,
        },
      ],
      options: [],
      examples: [],
    },
    {
      name: 'pull',
      description:
        'Pull all Development Environment Variables from the cloud and write to a file [.env.local]',
      arguments: [
        {
          name: 'filename',
          required: false,
        },
      ],
      options: [],
      examples: [],
    },
  ],
  options: [
    {
      name: 'environment',
      description:
        'Set the Environment (development, preview, production) when pulling Environment Variables',
      shorthand: null,
      type: 'boolean',
      deprecated: false,
      multi: false,
    },
    {
      name: 'git-branch',
      description:
        'Specify the Git branch to pull specific Environment Variables for',
      shorthand: null,
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'yes',
      description: 'Skip the confirmation prompt when removing an alias',
      shorthand: 'y',
      type: 'boolean',
      deprecated: false,
      multi: false,
    },
  ],
  examples: [
    {
      name: 'Pull all Development Environment Variables down from the cloud',
      value: [
        `${packageName} env pull <file>`,
        `${packageName} env pull .env.development.local`,
      ],
    },
    {
      name: 'Add a new variable to multiple Environments',
      value: [
        `${packageName} env add <name>`,
        `${packageName} env add API_TOKEN`,
      ],
    },
    {
      name: 'Add a new variable for a specific Environment',
      value: [
        `${packageName} env add <name> ${targetPlaceholder}`,
        `${packageName} env add DB_PASS production`,
      ],
    },
    {
      name: 'Add a sensitive Environment Variable',
      value: `${packageName} env add API_TOKEN --sensitive`,
    },
    {
      name: 'Add a new variable for a specific Environment and Git Branch',
      value: [
        `${packageName} env add <name> ${targetPlaceholder} <gitbranch>`,
        `${packageName} env add DB_PASS preview feat1`,
      ],
    },
    {
      name: 'Add a new Environment Variable from stdin',
      value: [
        `cat <file> | ${packageName} env add <name> ${targetPlaceholder}`,
        `cat ~/.npmrc | ${packageName} env add NPM_RC preview`,
        `${packageName} env add API_URL production < url.txt`,
      ],
    },
    {
      name: 'Remove a variable from multiple Environments',
      value: [
        `${packageName} env rm <name>`,
        `${packageName} env rm API_TOKEN`,
      ],
    },
    {
      name: 'Remove a variable from a specific Environment',
      value: [
        `${packageName} env rm <name> ${targetPlaceholder}`,
        `${packageName} env rm NPM_RC preview`,
      ],
    },
    {
      name: 'Remove a variable from a specific Environment and Git Branch',
      value: [
        `${packageName} env rm <name> ${targetPlaceholder} <gitbranch>`,
        `${packageName} env rm NPM_RC preview feat1`,
      ],
    },
  ],
};
