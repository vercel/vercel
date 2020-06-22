import { ErrorObject } from 'ajv';
import { NowBuildError } from '@vercel/build-utils';

export default function humanizeAjvError(
  error: ErrorObject,
  fileName = 'vercel.json'
): NowBuildError {
  const docsUrl = 'https://vercel.com/docs/configuration';
  try {
    const { dataPath, params } = error;
    let message = `Invalid ${fileName} -`;
    if (dataPath && dataPath.startsWith('.')) {
      message += ` property \`${dataPath.slice(1)}\``;
    }

    if ('additionalProperty' in params) {
      message += ` should NOT have additional property \`${params.additionalProperty}\`. Please remove it.`;
    } else if ('type' in params) {
      message += ` should be of type ${params.type}.`;
    } else if ('missingProperty' in params) {
      message += ` is missing property \`${params.missingProperty}\`.`;
    } else {
      message += ' should match configuration schema.';
    }

    const prop = getTopLevelPropertyName(dataPath);
    return new NowBuildError({
      code: 'DEV_VALIDATE_CONFIG',
      message: message,
      link: prop ? `${docsUrl}#project/${prop.toLowerCase()}` : docsUrl,
      action: 'View Documentation',
    });
  } catch (e) {
    return new NowBuildError({
      code: 'DEV_VALIDATE_CONFIG',
      message: `Failed to validate ${fileName} configuration.`,
      link: docsUrl,
      action: 'View Documentation',
    });
  }
}

/**
 * Get the top level property from the dataPath.
 * `.cleanUrls` => `cleanUrls`
 * `.headers[0].source` => `headers`
 * `.headers[0].headers[0]` => `headers`
 * `` => ``
 */
function getTopLevelPropertyName(dataPath: string): string {
  if (dataPath && dataPath.startsWith('.')) {
    const lastIndex = dataPath.indexOf('[');
    return lastIndex > -1 ? dataPath.slice(1, lastIndex) : dataPath.slice(1);
  }
  return '';
}
