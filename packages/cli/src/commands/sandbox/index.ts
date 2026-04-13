import type Client from '../../util/client';
import { printError } from '../../util/error';

type SandboxCliModule = {
  createApp(opts: { appName: string; withoutAuth: boolean }): {
    run(args: string[]): Promise<void>;
  };
};

function getFlagValue(args: string[], names: string[]) {
  let value: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const [option, inlineValue] = arg.split('=', 2);

    if (!names.includes(option)) {
      continue;
    }

    if (inlineValue !== undefined) {
      value = inlineValue;
      continue;
    }

    if (i + 1 < args.length) {
      value = args[i + 1];
      i++;
    }
  }

  return value;
}

export default async function sandbox(client: Client) {
  const argv = client.argv.slice(2);
  const commandIndex = argv.indexOf('sandbox');
  const rootArgs = commandIndex === -1 ? argv : argv.slice(0, commandIndex);
  const sandboxArgs = commandIndex === -1 ? [] : argv.slice(commandIndex + 1);
  const scope = getFlagValue(rootArgs, ['--scope', '-S']);
  const team = getFlagValue(rootArgs, ['--team', '-T']);
  const token = getFlagValue(rootArgs, ['--token', '-t']);
  const forwardedArgs = [
    ...(scope ? ['--scope', scope] : team ? ['--team', team] : []),
    ...sandboxArgs,
  ];
  const originalCwd = process.cwd();
  const originalAuthToken = process.env.VERCEL_AUTH_TOKEN;

  try {
    if (token) {
      process.env.VERCEL_AUTH_TOKEN = token;
    } else if (!process.env.VERCEL_AUTH_TOKEN && process.env.VERCEL_TOKEN) {
      process.env.VERCEL_AUTH_TOKEN = process.env.VERCEL_TOKEN;
    } else if (!process.env.VERCEL_AUTH_TOKEN && client.authConfig.token) {
      process.env.VERCEL_AUTH_TOKEN = client.authConfig.token;
    }

    process.chdir(client.cwd);

    const { createApp } = (await import('sandbox')) as SandboxCliModule;
    await createApp({
      appName: 'vercel sandbox',
      withoutAuth: false,
    }).run(forwardedArgs);

    return 0;
  } catch (error) {
    printError(error);
    return 1;
  } finally {
    process.chdir(originalCwd);

    if (typeof originalAuthToken === 'string') {
      process.env.VERCEL_AUTH_TOKEN = originalAuthToken;
    } else {
      delete process.env.VERCEL_AUTH_TOKEN;
    }
  }
}
