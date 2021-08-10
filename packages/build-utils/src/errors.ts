/**
 * This error should be thrown from a Builder in
 * order to stop the build and print a message.
 * This is necessary to avoid printing a stack trace.
 */
export class NowBuildError extends Error {
  public hideStackTrace = true;
  public code: string;
  public link?: string;
  public action?: string;

  constructor({ message, code, link, action }: Props) {
    super(message);
    this.code = code;
    this.link = link;
    this.action = action;
  }
}

interface Props {
  /**
   * The error message to display to the end-user.
   * Should be short yet descriptive of what they did wrong.
   */
  message: string;
  /**
   * A unique error code for this particular error.
   * Should start with the builder name such as `NODE_`.
   */
  code: string;
  /**
   * Optional hyperlink starting with https://vercel.com to
   * link to more information about this error.
   */
  link?: string;
  /**
   * Optional "action" to display before the `link`, such as "Learn More".
   */
  action?: string;
}

export function getPrettyError(obj: {
  dataPath?: string;
  message?: string;
  params: any;
}): NowBuildError {
  const docsUrl = 'https://vercel.com/docs/configuration';
  try {
    const { dataPath, params, message: ajvMessage } = obj;
    const prop = getTopLevelPropertyName(dataPath);
    let message =
      dataPath && dataPath.startsWith('.') ? `\`${dataPath.slice(1)}\` ` : '';

    if (params && typeof params.additionalProperty === 'string') {
      const suggestion = getSuggestion(prop, params.additionalProperty);
      message += `should NOT have additional property \`${params.additionalProperty}\`. ${suggestion}`;
    } else if (params && typeof params.missingProperty === 'string') {
      message += `missing required property \`${params.missingProperty}\`.`;
    } else {
      message += `${ajvMessage}.`;
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
      message: `Failed to validate configuration.`,
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
function getTopLevelPropertyName(dataPath?: string): string {
  if (dataPath && dataPath.startsWith('.')) {
    const lastIndex = dataPath.indexOf('[');
    return lastIndex > -1 ? dataPath.slice(1, lastIndex) : dataPath.slice(1);
  }
  return '';
}

const mapTypoToSuggestion: { [key: string]: { [key: string]: string } } = {
  '': {
    builder: 'builds',
    'build.env': '{ "build": { "env": {"name": "value"} } }',
    'builds.env': '{ "build": { "env": {"name": "value"} } }',
  },
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
  const choice = choices ? choices[additionalProperty] : undefined;
  return choice ? `Did you mean \`${choice}\`?` : 'Please remove it.';
}
