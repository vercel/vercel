import { packageName } from '../../util/pkg-name';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';
import { yesOption } from '../../util/arg-common';
import type { getFlagsSpecification } from '../../util/get-flags-specification';
import type { parseArguments } from '../../util/get-args';

export const pullCommand = {
  name: 'pull',
  aliases: [],
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
      argument: 'TARGET',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    {
      name: 'git-branch',
      description:
        'Specify the Git branch to pull specific Environment Variables for',
      argument: 'NAME',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    {
      name: 'prod',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      ...yesOption,
      description:
        'Skip questions when setting up new project using default scope and settings',
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
      name: 'Pull for a preview feature branch',
      value: `${packageName} pull --environment=preview --git-branch=feature-branch`,
    },
    {
      name: 'If you want to download environment variables to a specific file, use `vercel env pull` instead',
      value: `${packageName} env pull`,
    },
  ],
} as const;

export type PullCommandSpec = ReturnType<
  typeof getFlagsSpecification<(typeof pullCommand)['options']>
>;
export type PullCommandFlags = ReturnType<
  typeof parseArguments<PullCommandSpec>
>['flags'];
