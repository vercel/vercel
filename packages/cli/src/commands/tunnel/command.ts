import { packageName } from '../../util/pkg-name';

export const tunnelCommand = {
  name: 'tunnel',
  aliases: [],
  description: 'Expose a local port to the internet using a secure tunnel',
  arguments: [],
  options: [
    {
      name: 'port',
      description: 'Local port to tunnel',
      shorthand: null,
      type: Number,
      argument: 'PORT',
      deprecated: false,
    },
    {
      name: 'prod',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Expose the tunnel on production domain',
    },
  ],
  examples: [
    {
      name: 'Tunnel local port 3000 to preview',
      value: `${packageName} tunnel --port 3000`,
    },
    {
      name: 'Tunnel local port 8080 to production',
      value: `${packageName} tunnel --port 8080 --prod`,
    },
  ],
} as const;
