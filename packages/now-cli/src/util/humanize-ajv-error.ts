import { ErrorObject } from 'ajv';
import { NowBuildError } from '@vercel/build-utils';

export default function humanizeAjvError(
  error: ErrorObject,
  fileName = 'vercel.json'
): NowBuildError {
  console.log({ error }); // TODO: remove
  try {
    const { dataPath, params } = error;
    let message = `Invalid ${fileName} - property \`${dataPath.slice(1)}\``;
    if ('additionalProperty' in params) {
      message += ` should NOT have additional property \`${params.additionalProperty}\`.`;
    } else if ('type' in params) {
      message += ` should be of type ${params.type}.`;
    } else if ('missingProperty' in params) {
      message += ` is missing property \`${params.missingProperty}\`.`;
    }

    const fragment = getTopLevelPropertyName(dataPath).toLowerCase();
    return new NowBuildError({
      code: 'DEV_VALIDATE_CONFIG',
      message: message,
      link: `https://vercel.com/docs/configuration#project/${fragment}`,
      action: 'View Documentation',
    });
  } catch (e) {
    return new NowBuildError({
      code: 'DEV_VALIDATE_CONFIG',
      message: `Failed to validate ${fileName} configuration.`,
      link: `https://vercel.com/docs/configuration`,
      action: 'View Documentation',
    });
  }
}

/**
 * Get the top level property from the dataPath.
 * `.cleanUrls` => `cleanUrls`
 * `.headers[0].source` => `headers`
 * `.headers[0].headers[0]` => `headers`
 */
function getTopLevelPropertyName(dataPath: string) {
  const lastIndex = dataPath.indexOf('[');
  return lastIndex > -1 ? dataPath.slice(1, lastIndex) : dataPath.slice(1);
}
