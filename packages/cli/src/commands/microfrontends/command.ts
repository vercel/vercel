import { packageName } from '../../util/pkg-name';

export const pullSubcommand = {
  name: 'pull',
  aliases: [],
  description: 'Pull a Vercel Microfrontends configuration into your project',
  arguments: [],
  options: [
    {
      name: 'dpl',
      shorthand: null,
      deprecated: false,
      type: String,
      description:
        'The deploymentId to use for pulling the microfrontends configuration',
    },
  ],
  examples: [
    {
      name: 'Pull a microfrontends configuration',
      value: `${packageName} microfrontends pull`,
    },
    {
      name: 'Pull a microfrontends configuration for a specific deployment',
      value: `${packageName} microfrontends pull --dpl=<deployment-id>`,
    },
  ],
} as const;

export const microfrontendsCommand = {
  name: 'microfrontends',
  aliases: ['mf'],
  description: 'Manages your microfrontends',
  arguments: [],
  subcommands: [pullSubcommand],
  options: [],
  examples: [],
} as const;
