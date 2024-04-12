import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const devCommand: Command = {
  name: 'dev',
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
      description: 'Specify a URI endpoint on which to listen [0.0.0.0:3000]',
      argument: 'uri',
      shorthand: null,
      type: String,
      deprecated: false,
    },
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
  ],
};
