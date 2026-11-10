import {
  confirmOption,
  deploymentOption,
  environmentOption,
  forceOption,
  formatOption,
  jsonOption,
  projectOption,
  targetOption,
  yesOption,
} from '../../util/arg-common';

export const deprecatedArchiveSplitTgz = 'split-tgz';

export const initSubcommand = {
  name: 'init',
  aliases: [],
  description: 'Create a manual deployment that can be continued later',
  hidden: true as const,
  arguments: [],
  options: [
    {
      ...forceOption,
      deprecatedShorthand: 'f',
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
      name: 'env',
      shorthand: null,
      type: [String],
      argument: 'KEY=VALUE',
      deprecated: false,
      description:
        'Specify environment variables during run-time (e.g. `--env KEY1=value1 --env KEY2=value2`)',
    },
    {
      name: 'build-env',
      shorthand: null,
      type: [String],
      argument: 'KEY=VALUE',
      deprecated: false,
      description:
        'Specify environment variables during build-time (e.g. `--build-env KEY1=value1 --build-env KEY2=value2`)',
    },
    {
      name: 'meta',
      shorthand: null,
      deprecatedShorthand: 'm',
      type: [String],
      argument: 'KEY=VALUE',
      deprecated: false,
      description:
        'Specify metadata for the deployment (e.g. `--meta KEY1=value1 --meta KEY2=value2`)',
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
      name: 'prod',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Create a production deployment (shorthand for `--environment production`)',
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
      ...environmentOption,
      // `-e` is still the deprecated short form of `--env` here.
      shorthand: null,
      description:
        'Environment to deploy to: production, preview, or a custom environment',
    },
    targetOption,
    formatOption,
    jsonOption,
    confirmOption,
    projectOption,
  ],
  examples: [
    {
      name: 'Create a manual deployment',
      value: 'vercel deploy init',
    },
    {
      name: 'Create a manual production deployment',
      value: 'vercel deploy init --prod',
    },
  ],
} as const;

export const continueSubcommand = {
  name: 'continue',
  aliases: [],
  description: 'Continue a manual deployment by uploading build outputs',
  hidden: true as const,
  arguments: [],
  options: [
    {
      ...deploymentOption,
      description: 'The deployment ID to continue (e.g. dpl_xxx)',
    },
    // `--id` is the deprecated name of `--deployment`.
    { name: 'id', shorthand: null, type: String, deprecated: true },
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
      name: 'error',
      shorthand: null,
      type: String,
      argument: 'MESSAGE',
      deprecated: false,
      description: 'Mark the deployment as errored with a message',
    },
  ],
  examples: [
    {
      name: 'Continue a deployment by ID',
      value: 'vercel deploy continue --deployment dpl_xxx',
    },
  ],
} as const;

export const describeSubcommand = {
  name: 'describe',
  aliases: [],
  description:
    'Prepare deployment functions for provisioning in your AWS account',
  hidden: true as const,
  arguments: [],
  options: [
    {
      ...deploymentOption,
      description:
        'Deployment ID used with vercel build --deployment (required)',
    },
    // `--id` is the deprecated name of `--deployment`.
    { name: 'id', shorthand: null, type: String, deprecated: true },
    {
      name: 'aws-account-id',
      shorthand: null,
      type: String,
      argument: 'AWS_ACCOUNT',
      deprecated: false,
      description: '12-digit AWS account ID for provisioning (required)',
    },
    jsonOption,
  ],
  examples: [
    {
      name: 'Prepare a deployment for provisioning',
      value:
        'vercel deploy describe --deployment dpl_xxx --aws-account-id 123456789012',
    },
    {
      name: 'Return artifact paths as JSON',
      value:
        'vercel deploy describe --deployment dpl_xxx --aws-account-id 123456789012 --json',
    },
  ],
  helpSections: [
    {
      title: 'Notes',
      body: [
        'Uses the team in .vercel/project.json. Run vercel build --deployment first.',
        'Writes descriptor.json, function ZIPs, and runtime layers to .vercel/<DEPLOYMENT>/. Keep these artifacts private.',
        'Preserves the original build in .vercel/<DEPLOYMENT>/build/ and replaces .vercel/output with a code-free continuation.',
        'Does not create AWS resources. Provision the described functions before running vercel deploy continue --deployment <DEPLOYMENT>.',
        'Edge Functions and service outputs are not supported.',
      ],
    },
  ],
} as const;

export const deployCommand = {
  name: 'deploy',
  aliases: [],
  description:
    'Deploy your project to Vercel. Use `--temporary` to create a temporary deployment without logging in. The `deploy` command is the default command for the Vercel CLI, and can be omitted (`vc deploy my-app` equals `vc my-app`). Use `--dry` to inspect the detected framework preset and source files without deploying.',
  arguments: [
    {
      name: 'project-path',
      required: false,
    },
  ],
  subcommands: [initSubcommand, continueSubcommand, describeSubcommand],
  options: [
    {
      ...forceOption,
      deprecatedShorthand: 'f',
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
      name: 'env',
      shorthand: null,
      type: [String],
      argument: 'KEY=VALUE',
      deprecated: false,
      description:
        'Specify environment variables during run-time (e.g. `--env KEY1=value1 --env KEY2=value2`)',
    },
    {
      name: 'build-env',
      shorthand: null,
      type: [String],
      argument: 'KEY=VALUE',
      deprecated: false,
      description:
        'Specify environment variables during build-time (e.g. `--build-env KEY1=value1 --build-env KEY2=value2`)',
    },
    {
      name: 'turbo',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Use a Turbo build machine for this deployment',
    },
    {
      name: 'meta',
      shorthand: null,
      deprecatedShorthand: 'm',
      type: [String],
      argument: 'KEY=VALUE',
      deprecated: false,
      description:
        'Specify metadata for the deployment (e.g. `--meta KEY1=value1 --meta KEY2=value2`)',
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
        'Create a production deployment (shorthand for `--environment production`)',
    },
    {
      name: 'temporary',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Create a temporary deployment without logging in',
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
      name: 'verify',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        "Load the deployment URL once it is ready and report the status code, size, and page title, even with Deployment Protection on (creates the project's Protection Bypass for Automation secret if missing). Exits 1 if the load fails. Can't be used with --no-wait or --dry",
    },
    {
      name: 'dry',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Inspect the detected framework preset and source files without uploading or creating a deployment. Non-TTY output includes every file as JSON',
    },
    {
      name: 'create-if-missing',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        "Create the --project if it doesn't exist. Required with --yes and in non-interactive mode",
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
      shorthand: null,
      deprecatedShorthand: 'l',
      type: Boolean,
      deprecated: false,
      description: 'Print the build logs',
    },
    {
      name: 'guidance',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Receive command suggestions once deployment is complete',
    },
    {
      name: 'no-logs',
      shorthand: null,
      type: Boolean,
      deprecated: true,
      description: 'Do not print the build logs',
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
      ...environmentOption,
      // `-e` is still the deprecated short form of `--env` here.
      shorthand: null,
      description:
        'Environment to deploy to: production, preview, or a custom environment',
    },
    targetOption,
    formatOption,
    jsonOption,
    confirmOption,
    {
      ...projectOption,
      description:
        'Project name or ID to deploy to, without linking this directory (default: linked project). A missing name is created; with --yes or in non-interactive mode, add --create-if-missing',
    },
  ],
  examples: [
    {
      name: 'Deploy the current directory',
      value: 'vercel',
    },
    {
      name: 'Deploy a single HTML file',
      value: 'vercel ./index.html',
    },
    {
      name: 'Deploy a custom path',
      value: 'vercel /usr/src/project',
    },
    {
      name: 'Deploy to production and check that the URL loads',
      value: 'vercel deploy --prod --verify',
    },
    {
      name: 'Deploy with run-time Environment Variables',
      value: 'vercel --env NODE_ENV=production',
    },
    {
      name: 'Deploy with prebuilt outputs',
      value: ['vercel build', 'vercel deploy --prebuilt'],
    },
    {
      name: 'Deploy using a Turbo build machine',
      value: 'vercel deploy --turbo',
    },
    {
      name: 'Inspect deployment inputs without deploying',
      value: 'vercel deploy --dry',
    },
    {
      name: 'Get every deployment file as JSON',
      value: 'vercel deploy --dry --json',
    },
    {
      name: 'Write Deployment URL to a file',
      value: 'vercel > deployment-url.txt',
    },
  ],
} as const;
