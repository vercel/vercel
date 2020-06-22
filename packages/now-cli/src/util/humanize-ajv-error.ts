import { ErrorObject } from 'ajv';
import { NowBuildError } from '@vercel/build-utils';

export default function humanizeAjvError(
  error: ErrorObject,
  fileName = 'vercel.json'
): NowBuildError {
  const docsUrl = 'https://vercel.com/docs/configuration';
  try {
    const { dataPath, params } = error;
    const prop = getTopLevelPropertyName(dataPath);

    let message = `Invalid ${fileName} -`;
    if (dataPath && dataPath.startsWith('.')) {
      message += ` property \`${dataPath.slice(1)}\``;
    }

    if ('additionalProperty' in params) {
      const suggestion = getSuggestion(prop, params.additionalProperty);
      const solution = suggestion
        ? `Did you mean \`${suggestion}\`?`
        : 'Please remove it.';
      message += ` should NOT have additional property \`${params.additionalProperty}\`. ${solution}`;
    } else if ('type' in params) {
      message += ` should be of type ${params.type}.`;
    } else if ('missingProperty' in params) {
      message += ` is missing property \`${params.missingProperty}\`.`;
    } else {
      message += ' should match configuration schema.';
    }

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

const mapTypoToSuggestion: { [key: string]: { [key: string]: string } } = {
  '': { 'build.env': 'build', 'builds.env': 'build', builder: 'builds' },
  rewrites: { src: 'source', dest: 'destination' },
  redirects: { src: 'source', dest: 'destination', status: 'statusCode' },
  headers: { src: 'source', header: 'headers' },
  routes: {
    source: 'src',
    destination: 'dest',
    header: 'headers',
    method: 'methods',
  },
};

function getSuggestion(topLevelProp: string, additionalProperty: string) {
  const choices = mapTypoToSuggestion[topLevelProp];
  return choices ? choices[additionalProperty] : undefined;
}
