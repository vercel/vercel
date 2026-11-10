import { packageName } from '../../util/pkg-name';
import {
  deploymentOption,
  environmentOption,
  projectOption,
  targetOption,
  yesOption,
} from '../../util/arg-common';

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
      ...environmentOption,
      description:
        'Environment to build for: production, preview, or a custom environment (default: preview)',
    },
    targetOption,
    {
      name: 'output',
      description: 'Directory where built assets will be written to',
      shorthand: 'o',
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
      ...deploymentOption,
      description:
        'Deployment ID to pull environment variables from (e.g. dpl_xxx)',
    },
    // `--id` is the deprecated name of `--deployment`.
    { name: 'id', shorthand: null, type: String, deprecated: true },
    projectOption,
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
      value: `${packageName} build --deployment dpl_xxx`,
    },
  ],
} as const;
