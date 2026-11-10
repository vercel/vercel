import { packageName } from '../../util/pkg-name';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';
import {
  gitBranchOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';
import type { getFlagsSpecification } from '../../util/get-flags-specification';
import type { parseArguments } from '../../util/get-args';

export const pullCommand = {
  name: 'pull',
  aliases: [],
  description: 'Pull Environment Variables and project settings into .vercel',
  arguments: [
    {
      name: 'project-path',
      required: false,
    },
  ],
  options: [
    {
      name: 'environment',
      description: 'Deployment environment (default: development)',
      argument: 'ENVIRONMENT',
      shorthand: 'e',
      type: String,
      deprecated: false,
    },
    {
      ...gitBranchOption,
      description:
        'Specify the Git branch to pull specific Environment Variables for',
    },
    // Hidden: deprecated alias of `--environment production`.
    {
      name: 'prod',
      shorthand: null,
      type: Boolean,
      deprecated: true,
    },
    {
      ...yesOption,
      description:
        'Skip questions when setting up new project using default scope and settings',
    },
    projectOption,
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
      placeholders: [getEnvTargetPlaceholder()],
      value: `${packageName} pull --environment=${getEnvTargetPlaceholder()}`,
    },
    {
      name: 'Pull for a preview feature branch',
      value: `${packageName} pull --environment=preview --git-branch=feature-branch`,
    },
    {
      name: 'Pull Environment Variables into an application env file with `vercel env pull`',
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
