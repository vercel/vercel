import { Command } from '../help.js';
import { packageName } from '../../util/pkg-name.js';

export const listCommand: Command = {
  name: 'list',
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
      argument: 'KEY=value',
      shorthand: null,
      type: 'string',
      deprecated: false,
      multi: true,
    },
    {
      name: 'environment',
      description: '',
      argument: 'production|preview',
      shorthand: null,
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'next',
      description: 'Show next page of results',
      argument: 'MS',
      shorthand: 'n',
      type: 'string',
      deprecated: false,
      multi: false,
    },
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
};
