import { packageName } from '../../util/pkg-name';
import { confirmOption, projectOption, yesOption } from '../../util/arg-common';
import {
  DEV_QUEUE_DEFAULT_PORT,
  DEV_RUNTIME_CACHE_DEFAULT_PORT,
  DEV_SCHEDULES_DEFAULT_PORT,
} from '../../util/dev/resource-servers';

export const devCommand = {
  name: 'dev',
  aliases: ['develop'],
  description: `Starts the \`${packageName} dev\` server.`,
  arguments: [
    {
      name: 'dir',
      required: false,
    },
  ],
  options: [
    {
      name: 'listen',
      description:
        'Specify a URI endpoint on which to listen (default: 0.0.0.0:3000)',
      argument: 'URI',
      shorthand: null,
      deprecatedShorthand: 'l',
      type: String,
      deprecated: false,
    },
    {
      name: 'local',
      shorthand: null,
      deprecatedShorthand: 'L',
      type: Boolean,
      deprecated: false,
      description: 'Start the dev server without linking to a Vercel project',
    },
    {
      name: 'queue-port',
      description: `Specify the local Vercel Queues server port (default: ${DEV_QUEUE_DEFAULT_PORT})`,
      argument: 'PORT',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    {
      name: 'runtime-cache-port',
      description: `Specify the local Runtime Cache server port (default: ${DEV_RUNTIME_CACHE_DEFAULT_PORT})`,
      argument: 'PORT',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    // Internal: without a description, help leaves it out.
    {
      name: 'tunnel',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'schedules-port',
      description: `Specify the local Vercel Schedules server port (default: ${DEV_SCHEDULES_DEFAULT_PORT})`,
      argument: 'PORT',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    yesOption,
    { name: 'port', shorthand: 'p', type: String, deprecated: true },
    confirmOption,
    // `-p` is still the hidden short form of `--port` until the next major.
    { ...projectOption, shorthand: null },
  ],
  examples: [
    {
      name: `Start the \`${packageName} dev\` server on port 8080`,
      value: `${packageName} dev --listen 8080`,
    },
    {
      name: 'Make the `vercel dev` server bind to localhost on port 5000',
      value: `${packageName} dev --listen 127.0.0.1:5000 `,
    },
    {
      name: 'Pin local resource server ports',
      value: `${packageName} dev --queue-port 5782 --runtime-cache-port 5783 --schedules-port 5784`,
    },
  ],
} as const;
