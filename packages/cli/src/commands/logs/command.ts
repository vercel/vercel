import { formatOption, jsonOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

// has to be ms compliant
// https://github.com/vercel/ms/blob/fe5338229cfdac6822891dcb9c24660b4d2e612b/src/index.ts#L95
export const CommandTimeout = '5 minutes';

export const logsCommand = {
  name: 'logs',
  aliases: ['log'],
  description: `Display runtime logs for a deployment in ready state, from now and for ${CommandTimeout} at most.`,
  arguments: [
    {
      name: 'url|deploymentId',
      required: true,
    },
  ],
  options: [
    formatOption,
    jsonOption,
    {
      name: 'follow',
      shorthand: 'f',
      type: Boolean,
      deprecated: true,
    },
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      deprecated: true,
    },
    {
      name: 'since',
      shorthand: null,
      type: String,
      deprecated: true,
    },
    {
      name: 'until',
      shorthand: null,
      type: String,
      deprecated: true,
    },
    {
      name: 'output',
      shorthand: 'o',
      type: String,
      deprecated: true,
    },
  ],
  examples: [
    {
      name: 'Pretty print all the new runtime logs for the deployment DEPLOYMENT_URL from now on',
      value: `${packageName} logs DEPLOYMENT_URL`,
    },
    {
      name: 'Print all runtime logs for the deployment DEPLOYMENT_ID as json objects',
      value: `${packageName} logs DEPLOYMENT_ID --format=json`,
    },
    {
      name: 'Filter runtime logs for warning with JQ third party tool',
      value: `${packageName} logs DEPLOYMENT_ID --format=json | jq 'select(.level == "warning")'`,
    },
  ],
} as const;
