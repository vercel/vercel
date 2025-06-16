import { packageName } from '../../util/pkg-name';

export const pullSubcommand = {
  name: 'pull',
  aliases: [],
  description: 'Pull a Vercel Microfrontend configuration into your project',
  arguments: [],
  options: [
    {
      name: 'dpl',
      shorthand: null,
      deprecated: false,
      type: String,
      description:
        'The deploymentId to use for pulling the Microfrontend configuration',
      required: true,
    },
  ],
  examples: [
    {
      name: 'Pull a Microfrontend configuration',
      value: `${packageName} microfrontends pull`,
    },
    {
      name: 'Pull a Microfrontend configuration for a specific deployment',
      value: `${packageName} microfrontends pull --dpl=<deployment-id>`,
    },
  ],
} as const;

export const microfrontendsCommand = {
  name: 'microfrontends',
  aliases: ['mf'],
  description: 'Manage your Vercel Microfrontends',
  arguments: [],
  subcommands: [pullSubcommand],
  options: [],
  examples: [],
} as const;
