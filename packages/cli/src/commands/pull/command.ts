import { Command } from '../help';
import { packageName } from '../../util/pkg-name';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';

export const pullCommand: Command = {
  name: 'pull',
  description:
    'Pull latest environment variables and project settings from Vercel. ',
  arguments: [
    {
      name: 'project-path',
      required: false,
    },
  ],
  options: [
    {
      name: 'environment',
      description: 'Deployment environment [development]',
      argument: 'environment',
      shorthand: null,
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'yes',
      description:
        'Skip questions when setting up new project using default scope and settings',
      shorthand: 'y',
      type: 'string',
      deprecated: false,
      multi: false,
    },
  ],
  examples: [
    {
      name: 'Pull the latest Environment Variables and Project Settings from the cloud',
      value: `${packageName} pull`,
    },
    {
      name: 'Pull the latest Environment Variables and Project Settings from the cloud targeting a directory',
      value: `${packageName} pull ./path-to-project`,
    },
    {
      name: 'Pull for a specific environment',
      value: `${packageName} pull --environment=${getEnvTargetPlaceholder()}`,
    },
    {
      name: 'If you want to download environment variables to a specific file, use `vercel env pull` instead',
      value: `${packageName} env pull`,
    },
  ],
};
