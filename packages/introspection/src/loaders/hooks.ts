let honoUrl: string | null = null;
let expressUrl: string | null = null;

export async function resolve(
  specifier: string,
  context: any,
  nextResolve: any
) {
  const result = await nextResolve(specifier, context);

  if (specifier === 'hono') {
    honoUrl = result.url;
  } else if (specifier === 'express') {
    expressUrl = result.url;
  }

  return result;
}

export async function load(
  url: string,
  context: any,
  nextLoad: (url: string, context: any) => Promise<any>
) {
  const result = await nextLoad(url, context);

  if (expressUrl === url) {
    const pathToExpressExtract = new URL('../express.mjs', import.meta.url);
    // Create a shim that captures the Express app instance
    const shimSource = `
import { handle} from ${JSON.stringify(pathToExpressExtract.toString())};
import originalExpress from ${JSON.stringify(url + '?original')};

const extendedExpress = handle(originalExpress);

export * from ${JSON.stringify(url + '?original')};
export default extendedExpress;
`;

    return {
      format: 'module',
      source: shimSource,
      shortCircuit: true,
    };
  }
  if (honoUrl === url) {
    const pathToHonoExtract = new URL('../hono.mjs', import.meta.url);
    const shimSource = `
import { handle } from ${JSON.stringify(pathToHonoExtract.toString())};
import * as originalHono from ${JSON.stringify(url + '?original')};

export * from ${JSON.stringify(url + '?original')};
export const Hono = handle(originalHono);
`;

    return {
      format: 'module',
      source: shimSource,
      shortCircuit: true,
    };
  }

  // Handle the ?original redirect to actual source
  if (url.endsWith('?original')) {
    const originalUrl = url.replace('?original', '');
    if (originalUrl === honoUrl || originalUrl === expressUrl) {
      return result;
    }
  }

  return result;
}
