import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

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
      type: [String],
      deprecated: false,
    },
    {
      name: 'environment',
      description: '',
      argument: 'production|preview',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    {
      name: 'next',
      description: 'Show next page of results',
      argument: 'MS',
      shorthand: 'n',
      type: String,
      deprecated: false,
    },
    {
      name: 'policy',
      description:
        'Preview deployments by retention policy (e.g.: `-p preview=1w`). Can appear many times.',
      argument:
        '[canceled|errored|preview|production]=[1d|1w|1m|2m|3m|1y|unlimited]',
      shorthand: null,
      type: [String],
      deprecated: false,
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
    {
      name: 'Preview deployments affected by deployment retention policies',
      value: `${packageName} list -p canceled=1d -p errored=1w -p preview=1m -p production=1y`,
    },
  ],
};
