import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

// has to be ms compliant
// https://github.com/vercel/ms/blob/fe5338229cfdac6822891dcb9c24660b4d2e612b/src/index.ts#L95
export const CommandTimeout = '1 minutes';

export const logsCommand: Command = {
  name: 'logs',
  description: `Display runtime logs for a specific deployment, if it is live, from now and for ${CommandTimeout} at most.`,
  arguments: [
    {
      name: 'url|deploymentId',
      required: true,
    },
  ],
  options: [
    {
      name: 'json',
      shorthand: 'j',
      type: Boolean,
      deprecated: false,
      description: 'print each log line as a JSON object (compatible with JQ)',
    },
  ],
  examples: [
    {
      name: 'Pretty print all the new runtime logs for the deployment DEPLOYMENT_URL from now on',
      value: `${packageName} logs DEPLOYMENT_URL`,
    },
    {
      name: 'Print all runtime logs for the deployment DEPLOYMENT_ID as json objects',
      value: `${packageName} logs DEPLOYMENT_ID --json`,
    },
    {
      name: 'Filter runtime logs for warning with JQ third party tool',
      value: `${packageName} logs DEPLOYMENT_ID --json | jq 'select(.level == "warning")'`,
    },
  ],
};
