import { BuildV2, Files } from '@vercel/build-utils';
import { introspectApp as introspectWithLoader } from './loader.js';

type RolldownResult = {
  dir: string;
  handler: string;
  files: Files;
};

export const introspectApp = async (
  args: Parameters<BuildV2>[0],
  rolldownResult: RolldownResult
) => {
  const framework = args.config.projectSettings?.framework ?? '';

  // Use the new unified loader for both express and hono
  if (
    framework === 'express-experimental' ||
    framework === 'hono-experimental'
  ) {
    return introspectWithLoader(args, rolldownResult);
  }
  throw new Error(`Unknown framework: ${framework}`);
};
