import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const buildCommand = {
  name: 'build',
  aliases: [],
  description: 'Build the project.',
  arguments: [],
  options: [
    {
      name: 'prod',
      description: 'Build a production deployment',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'target',
      shorthand: null,
      type: String,
      argument: 'TARGET',
      deprecated: false,
      description: 'Specify the target environment',
    },
    {
      name: 'output',
      description: 'Directory where built assets will be written to',
      shorthand: null,
      argument: 'DIR',
      type: String,
      deprecated: false,
    },
    {
      ...yesOption,
      description:
        'Skip the confirmation prompt about pulling environment variables and project settings when not found locally',
    },
    {
      name: 'standalone',
      description:
        'Create a standalone build with all dependencies inlined into function output folders',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'id',
      description:
        'Deployment ID to pull environment variables from (e.g. dpl_xxx)',
      shorthand: null,
      type: String,
      argument: 'ID',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Build the project',
      value: `${packageName} build`,
    },
    {
      name: 'Build the project in a specific directory',
      value: `${packageName} build --cwd ./path-to-project`,
    },
    {
      name: 'Build with deployment-scoped environment variables',
      value: `${packageName} build --id dpl_xxx`,
    },
  ],
} as const;
