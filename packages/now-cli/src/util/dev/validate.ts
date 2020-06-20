import Ajv from 'ajv';
import {
  routesSchema,
  cleanUrlsSchema,
  headersSchema,
  redirectsSchema,
  rewritesSchema,
  trailingSlashSchema,
} from '@vercel/routing-utils';
import { NowConfig } from './types';
import {
  functionsSchema,
  buildsSchema,
  NowBuildError,
} from '@vercel/build-utils';

const vercelConfigSchema = {
  type: 'object',
  // These are not all possibilities because `vc dev`
  // doesn't need to know about `regions`, `public`, etc.
  additionalProperties: true,
  properties: {
    builds: buildsSchema,
    routes: routesSchema,
    cleanUrls: cleanUrlsSchema,
    headers: headersSchema,
    redirects: redirectsSchema,
    rewrites: rewritesSchema,
    trailingSlash: trailingSlashSchema,
    functions: functionsSchema,
  },
};

const ajv = new Ajv();

export function validateConfig(config: NowConfig) {
  const validate = ajv.compile(vercelConfigSchema);
  if (!validate(config)) {
    if (!validate.errors) {
      return null;
    }

    const error = validate.errors[0];
    console.log({ error }); // TODO: remove
    const { dataPath, schemaPath, message, params } = error;
    const [hash, type, property] = schemaPath.split('/');
    if (hash === '#' && type === 'properties' && property) {
      let prettyMessage = `Configuration property \`${property}\``;
      if ('additionalProperty' in params) {
        prettyMessage += ` should NOT have additional property \`${params.additionalProperty}\`.`;
      } else if ('type' in params) {
        prettyMessage += ` should be of type ${params.type} but found type object.`;
      } else if ('missingProperty' in params) {
        prettyMessage += ` is missing property \`${params.missingProperty}\`.`;
      }
      return new NowBuildError({
        code: 'DEV_VALIDATE_CONFIG',
        message: prettyMessage,
        link: `https://vercel.com/docs/configuration#project/${property.toLowerCase()}`,
        action: 'Learn More',
      });
    }

    return new NowBuildError({
      code: 'DEV_VALIDATE_CONFIG',
      message: `${dataPath} ${message} ${JSON.stringify(params)}`,
    });

    /*
    if ('additionalProperty' in error.params) {
      const { additionalProperty } = error.params;
      return `Unknown property ${additionalProperty} at \`${String(key)}\`${error.dataPath}, ${
        error.message
      }`;
    }

    return `Invalid \`${String(key)}\` property: ${error.dataPath} ${
      error.message
    }`;*/
  }

  return null;
}
