import { packageName } from '../../util/pkg-name';
import { confirmOption, nextOption, yesOption } from '../../util/arg-common';

export const listCommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List app deployments for an app.',
  arguments: [
    {
      name: 'app',
      required: false,
    },
  ],
  options: [
    {
      name: 'meta',
      description:
        'Filter deployments by metadata (e.g.: `-m KEY=value`). Can appear many times.',
      argument: 'KEY=VALUE',
      shorthand: 'm',
      type: [String],
      deprecated: false,
    },
    {
      name: 'policy',
      description:
        'See deployments with provided Deployment Retention policies (e.g.: `-p KEY=value`). Can appear many times.',
      argument: 'KEY=VALUE',
      shorthand: 'p',
      type: [String],
      deprecated: false,
    },
    {
      name: 'environment',
      description: '',
      argument: 'TARGET',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    nextOption,
    // this can be deprecated someday
    { name: 'prod', shorthand: null, type: Boolean, deprecated: false },
    yesOption,
    confirmOption,
  ],
  examples: [
    {
      name: 'List all deployments for the currently linked project',
      value: `${packageName} list`,
    },
    {
      name: 'List all deployments for the project `my-app` in the team of the currently linked project',
      value: `${packageName} list my-app`,
    },
    {
      name: 'Filter deployments by metadata',
      value: `${packageName} list -m key1=value1 -m key2=value2`,
    },
    {
      name: 'Paginate deployments for a project, where `1584722256178` is the time in milliseconds since the UNIX epoch',
      value: `${packageName} list my-app --next 1584722256178`,
    },
  ],
} as const;
