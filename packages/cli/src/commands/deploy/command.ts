import { confirmOption, forceOption, yesOption } from '../../util/arg-common';

export const deprecatedArchiveSplitTgz = 'split-tgz';

export const deployCommand = {
  name: 'deploy',
  aliases: [],
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
      ...forceOption,
      description: 'Force a new deployment even if nothing has changed',
    },
    {
      name: 'with-cache',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Retain build cache when using "--force"',
    },
    {
      name: 'public',
      shorthand: 'p',
      type: Boolean,
      deprecated: false,
      description: 'Deployment is public (`/_src`) is exposed)',
    },
    {
      name: 'env',
      shorthand: 'e',
      type: [String],
      argument: 'KEY=VALUE',
      deprecated: false,
      description:
        'Specify environment variables during run-time (e.g. `-e KEY1=value1 -e KEY2=value2`)',
    },
    {
      name: 'build-env',
      shorthand: 'b',
      type: [String],
      argument: 'KEY=VALUE',
      deprecated: false,
      description:
        'Specify environment variables during build-time (e.g. `-b KEY1=value1 -b KEY2=value2`)',
    },
    {
      name: 'meta',
      shorthand: 'm',
      type: [String],
      argument: 'KEY=VALUE',
      deprecated: false,
      description:
        'Specify metadata for the deployment (e.g. `-m KEY1=value1 -m KEY2=value2`)',
    },
    {
      name: 'regions',
      shorthand: null,
      type: String,
      argument: 'REGION',
      deprecated: false,
      description: 'Set default regions to enable the deployment on',
    },
    {
      name: 'prebuilt',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Use in combination with `vc build`. Deploy an existing build',
    },
    {
      name: 'prod',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Create a production deployment (shorthand for `--target=production`)',
    },
    {
      name: 'archive',
      shorthand: null,
      type: String,
      argument: 'FORMAT',
      deprecated: false,
      description:
        'Compress the deployment code into an archive before uploading it',
    },
    {
      name: 'no-wait',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: "Don't wait for the deployment to finish",
    },
    {
      name: 'skip-domain',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Disable the automatic promotion (aliasing) of the relevant domains to a new production deployment. You can use `vc promote` to complete the domain-assignment process later',
    },
    {
      ...yesOption,
      description: 'Use default options to skip all prompts',
    },
    {
      name: 'logs',
      shorthand: 'l',
      type: Boolean,
      deprecated: false,
      description: 'Print the build logs',
    },
    {
      name: 'name',
      shorthand: 'n',
      type: String,
      deprecated: true,
    },
    {
      name: 'no-clipboard',
      shorthand: null,
      type: Boolean,
      deprecated: true,
    },
    {
      name: 'target',
      shorthand: null,
      type: String,
      argument: 'TARGET',
      deprecated: false,
      description: 'Specify the target deployment environment',
    },
    confirmOption,
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
} as const;
