import Ajv from 'ajv';
import { routesSchema } from '@now/routing-utils';
import { NowConfig } from './types';

const ajv = new Ajv();

const buildsSchema = {
  type: 'array',
  minItems: 0,
  maxItems: 128,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['use'],
    properties: {
      src: {
        type: 'string',
        minLength: 1,
        maxLength: 4096,
      },
      use: {
        type: 'string',
        minLength: 3,
        maxLength: 256,
      },
      config: { type: 'object' },
    },
  },
};

const validateBuilds = ajv.compile(buildsSchema);
const validateRoutes = ajv.compile(routesSchema);

export function validateNowConfigBuilds({ builds }: NowConfig) {
  if (!builds) {
    return null;
  }

  if (!validateBuilds(builds)) {
    if (!validateBuilds.errors) {
      return null;
    }

    const error = validateBuilds.errors[0];

    return `Invalid \`builds\` property: ${error.dataPath} ${error.message}`;
  }

  return null;
}

export function validateNowConfigRoutes({ routes }: NowConfig) {
  if (!routes) {
    return null;
  }

  if (!validateRoutes(routes)) {
    if (!validateRoutes.errors) {
      return null;
    }

    const error = validateRoutes.errors[0];

    return `Invalid \`routes\` property: ${error.dataPath} ${error.message}`;
  }

  return null;
}
