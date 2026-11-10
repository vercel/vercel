import { packageName } from '../../util/pkg-name';
import {
  formatOption,
  jsonOption,
  limitOption,
  nextCursorOption,
  projectOption,
  sinceOption,
  untilOption,
} from '../../util/arg-common';

const id = 'dmni_01k7d0q5w3x8y9z0a1b2c3d4e5';
const output = [formatOption, jsonOption] as const;
const project = { ...projectOption, shorthand: 'p' } as const;
const example = (name: string, args: string) => ({
  name,
  value: `${packageName} daemons ${args}`,
});

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  default: true,
  description: 'List all production daemons for a project',
  arguments: [],
  options: [
    project,
    {
      ...limitOption,
      shorthand: 'n',
      description: 'Max daemons (default: all, max: 100)',
    },
    nextCursorOption,
    ...output,
  ],
  examples: [example('List daemons as JSON', 'list --json')],
} as const;

export const scaleSubcommand = {
  name: 'scale',
  aliases: [],
  description: 'Set Production instance counts by region (e.g. iad1=3 fra1=1)',
  arguments: [
    { name: 'daemon', required: true },
    { name: 'overrides', required: false, multiple: true },
  ],
  options: [
    project,
    {
      name: 'reset',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Remove the overrides and use the configured counts',
    },
    ...output,
  ],
  examples: [
    example(
      'Run 3 instances in iad1 and 1 in fra1',
      'scale worker iad1=3 fra1=1'
    ),
    example('Remove the overrides', 'scale worker --reset'),
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description:
    "Show a Production daemon's configuration and instance readiness",
  arguments: [{ name: 'daemon', required: true }],
  options: [project, ...output],
  examples: [
    example('Inspect a daemon', 'inspect worker'),
    example(
      'Inspect a daemon in a project',
      'inspect worker --project acme-web'
    ),
    example('Inspect a daemon as JSON', 'inspect worker --json'),
  ],
} as const;

export const instancesListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all production daemon instances, for one or all daemons',
  arguments: [{ name: 'daemon', required: false }],
  options: [project, ...output],
  examples: [
    example('List the instances of a daemon', 'instances list worker'),
  ],
} as const;

export const instancesInspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show the details and usage metrics of a daemon instance',
  arguments: [{ name: 'instance', required: true }],
  options: [
    project,
    { ...sinceOption, description: 'Start of the metrics (default: 1h)' },
    untilOption,
    ...output,
  ],
  examples: [example('Show a day of usage', `instances inspect ${id} -s 1d`)],
} as const;

export const instancesRestartSubcommand = {
  name: 'restart',
  aliases: [],
  description: 'Restart a daemon instance: SIGTERM, then a new container',
  arguments: [{ name: 'instance', required: true }],
  options: [project, ...output],
  examples: [example('Restart an instance', `instances restart ${id}`)],
} as const;

export const instancesSubcommand = {
  name: 'instances',
  aliases: ['instance'],
  description: 'Manage daemon instances',
  arguments: [],
  subcommands: [
    instancesListSubcommand,
    instancesInspectSubcommand,
    instancesRestartSubcommand,
  ],
  options: [],
  examples: [],
} as const;

export const daemonsCommand = {
  name: 'daemons',
  aliases: ['daemon'],
  description: 'Manage daemons for a project',
  arguments: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    scaleSubcommand,
    instancesSubcommand,
  ],
  options: [],
  examples: [],
} as const;
