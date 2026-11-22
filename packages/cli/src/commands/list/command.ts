import { packageName } from '../../util/pkg-name';
import {
  allOption,
  confirmOption,
  formatOption,
  jsonOption,
  limitOption,
  nextCursorOption,
  yesOption,
} from '../../util/arg-common';

export const listCommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List deployments.',
  arguments: [
    {
      name: 'app',
      required: false,
    },
  ],
  options: [
    allOption,
    {
      name: 'meta',
      description:
        'Filter deployments by metadata (e.g. `--meta KEY=value`). Can appear many times.',
      argument: 'KEY=VALUE',
      shorthand: null,
      deprecatedShorthand: 'm',
      type: [String],
      deprecated: false,
    },
    {
      name: 'policy',
      description:
        'See deployments with provided Deployment Retention policies (e.g. `--policy KEY=value`). Can appear many times.',
      argument: 'KEY=VALUE',
      shorthand: null,
      deprecatedShorthand: 'p',
      type: [String],
      deprecated: false,
    },
    {
      name: 'environment',
      description: 'Filter deployments by environment',
      argument: 'ENVIRONMENT',
      shorthand: 'e',
      type: String,
      deprecated: false,
    },
    {
      name: 'status',
      description:
        'Filter deployments by their status. Can be comma-separated for multiple statuses (e.g.: `--status BUILDING,READY`)',
      argument: 'STATUS',
      shorthand: null,
      deprecatedShorthand: 's',
      type: String,
      deprecated: false,
    },
    nextCursorOption,
    limitOption,
    // Hidden: deprecated alias of `--environment production`.
    { name: 'prod', shorthand: null, type: Boolean, deprecated: true },
    yesOption,
    confirmOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'List all deployments for the currently linked project',
      value: `${packageName} list`,
    },
    {
      name: 'List all deployments across all projects',
      value: `${packageName} list --all`,
    },
    {
      name: 'List all deployments for the project `my-app`',
      value: `${packageName} list my-app`,
    },
    {
      name: 'Filter deployments by metadata',
      value: `${packageName} list --meta key1=value1 --meta key2=value2`,
    },
    {
      name: 'Show the next page, using the cursor from the previous output',
      placeholders: ['<CURSOR>'],
      value: `${packageName} list my-app --next <CURSOR>`,
    },
    {
      name: 'Filter deployments by status',
      value: `${packageName} list --status READY`,
    },
    {
      name: 'Filter deployments by multiple statuses',
      value: `${packageName} list --status BUILDING,ERROR`,
    },
  ],
} as const;
