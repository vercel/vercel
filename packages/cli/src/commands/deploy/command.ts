import { Command } from '../help';

export const deployCommand: Command = {
  name: 'deploy',
  description:
    'Deploy your project to Vercel. The `deploy` command is the default command for the Vercel CLI, and can be omitted (`vc deploy my-app` equals `vc my-app`).',
  arguments: [
    {
      name: 'project-path',
      required: false,
    },
  ],
  options: [
    {
      name: 'force',
      shorthand: 'f',
      type: 'boolean',
      deprecated: false,
      description: 'Force a new deployment even if nothing has changed',
      multi: false,
    },
    {
      name: 'with-cache',
      shorthand: null,
      type: 'boolean',
      deprecated: false,
      description: 'Retain build cache when using "--force"',
      multi: false,
    },
    {
      name: 'public',
      shorthand: 'p',
      type: 'boolean',
      deprecated: false,
      description: 'Deployment is public (`/_src`) is exposed)',
      multi: false,
    },
    {
      name: 'env',
      shorthand: 'e',
      type: 'string',
      argument: 'key=value',
      deprecated: false,
      multi: true,
      description:
        'Specify environment variables during run-time (e.g. `-e KEY1=value1 -e KEY2=value2`)',
    },
    {
      name: 'build-env',
      shorthand: 'b',
      type: 'string',
      argument: 'key=value',
      deprecated: false,
      multi: true,
      description:
        'Specify environment variables during build-time (e.g. `-b KEY1=value1 -b KEY2=value2`)',
    },
    {
      name: 'meta',
      shorthand: 'm',
      type: 'string',
      argument: 'key=value',
      deprecated: false,
      multi: true,
      description:
        'Specify metadata for the deployment (e.g. `-m KEY1=value1 -m KEY2=value2`)',
    },
    {
      name: 'regions',
      shorthand: null,
      type: 'string',
      deprecated: false,
      description: 'Set default regions to enable the deployment on',
      multi: false,
    },
    {
      name: 'prebuilt',
      shorthand: null,
      type: 'boolean',
      deprecated: false,
      description:
        'Use in combination with `vc build`. Deploy an existing build',
      multi: false,
    },
    {
      name: 'prod',
      shorthand: null,
      type: 'boolean',
      deprecated: false,
      description: 'Create a production deployment',
      multi: false,
    },
    {
      name: 'archive',
      shorthand: null,
      type: 'string',
      deprecated: false,
      description:
        'Compress the deployment code into a file before uploading it',
      multi: false,
    },
    {
      name: 'no-wait',
      shorthand: null,
      type: 'boolean',
      deprecated: false,
      description: "Don't wait for the deployment to finish",
      multi: false,
    },
    {
      name: 'skip-domain',
      shorthand: null,
      type: 'boolean',
      deprecated: false,
      description:
        'Disable the automatic promotion (aliasing) of the relevant domains to a new production deployment. You can use `vc promote` to complete the domain-assignment process later',
      multi: false,
    },
    {
      name: 'yes',
      shorthand: 'y',
      type: 'boolean',
      deprecated: false,
      description: 'Use default options to skip all prompts',
      multi: false,
    },
    {
      name: 'name',
      shorthand: 'n',
      type: 'string',
      deprecated: true,
      description: 'Provide a Vercel Project name',
      multi: false,
    },
    {
      name: 'no-clipboard',
      shorthand: null,
      type: 'boolean',
      deprecated: true,
      description: 'Do not copy deployment URL to clipboard',
      multi: false,
    },
    {
      name: 'target',
      shorthand: null,
      type: 'string',
      deprecated: true,
      description: 'Specify the target deployment environment',
      multi: false,
    },
    {
      name: 'confirm',
      shorthand: 'c',
      type: 'boolean',
      deprecated: true,
      description: 'Use default options to skip all prompts',
      multi: false,
    },
  ],
  examples: [
    {
      name: 'Deploy the current directory',
      value: 'vercel',
    },
    {
      name: 'Deploy a custom path',
      value: 'vercel /usr/src/project',
    },
    {
      name: 'Deploy with run-time Environment Variables',
      value: 'vercel -e NODE_ENV=production',
    },
    {
      name: 'Deploy with prebuilt outputs',
      value: ['vercel build', 'vercel deploy --prebuilt'],
    },
    {
      name: 'Write Deployment URL to a file',
      value: 'vercel > deployment-url.txt',
    },
  ],
};
