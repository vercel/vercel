import { BuildV2, Files } from '@vercel/build-utils';
import { introspectApp as introspectExpressApp } from './express';

type RolldownResult = {
  dir: string;
  handler: string;
  files: Files;
};

export const introspectApp = async (
  args: Parameters<BuildV2>[0],
  rolldownResult: RolldownResult
) => {
  const map: Record<
    string,
    (
      args: Parameters<BuildV2>[0],
      rolldownResult: RolldownResult
    ) => Promise<{
      routes: {
        src?: string;
        dest?: string;
        methods?: string[];
      }[];
    }>
  > = {
    'express-experimental': introspectExpressApp,
    // 'hono-experimental': introspectHonoApp,
  };
  const introspectApp = map[args.config.projectSettings?.framework ?? ''];
  if (!introspectApp) {
    throw new Error(
      `Unknown framework: ${args.config.projectSettings?.framework}`
    );
  }
  return introspectApp(args, rolldownResult);
};
