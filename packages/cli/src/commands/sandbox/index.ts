import type Client from '../../util/client';
import { printError } from '../../util/error';
import getSubcommand from '../../util/get-subcommand';
import { getCommandAliases } from '..';
import { SandboxTelemetryClient } from '../../util/telemetry/commands/sandbox';
import { execSubcommand } from './exec/command';
import exec from './exec';
import { createSubcommand } from './create/command';
import create from './create';
import { connectSubcommand } from './connect/command';
import connect from './connect';
import { shSubcommand } from './sh/command';
import sh from './sh';
import { forkSubcommand } from './fork/command';
import fork from './fork';
import { runSubcommand } from './run/command';
import run from './run';

type SandboxCliModule = {
  createApp(opts: { appName: string; withoutAuth: boolean }): {
    run(args: string[]): Promise<void>;
  };
};

// Native subcommands (name -> aliases) are registered here as they are ported
// off the standalone `sandbox` package: PR #2 adds exec/create/connect/sh/fork/
// run, PR #3 adds list/stop/remove/cp/snapshot/snapshots/sessions, PR #4 adds
// config. Unregistered subcommands fall through to runPassThrough().
const COMMAND_CONFIG: Record<string, string[]> = {
  exec: getCommandAliases(execSubcommand),
  create: getCommandAliases(createSubcommand),
  connect: getCommandAliases(connectSubcommand),
  sh: getCommandAliases(shSubcommand),
  fork: getCommandAliases(forkSubcommand),
  run: getCommandAliases(runSubcommand),
};

export default async function sandbox(client: Client): Promise<number> {
  const telemetry = new SandboxTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const argv = client.argv.slice(2);
  const commandIndex = argv.indexOf('sandbox');
  const sandboxArgs = commandIndex === -1 ? [] : argv.slice(commandIndex + 1);

  // Incremental dispatcher: getSubcommand matches the first sandbox arg against
  // COMMAND_CONFIG. Each ported subcommand adds a `case` here (e.g.
  // `case 'create': return create(client, args)`); anything not yet native hits
  // `default` and is forwarded to the existing `sandbox` package.
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    sandboxArgs,
    COMMAND_CONFIG
  );

  switch (subcommand) {
    case 'exec':
      telemetry.trackCliSubcommandExec(subcommandOriginal);
      return exec(client, args);
    case 'create':
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      return create(client, args);
    case 'connect':
      telemetry.trackCliSubcommandConnect(subcommandOriginal);
      return connect(client, args);
    case 'sh':
      telemetry.trackCliSubcommandSh(subcommandOriginal);
      return sh(client, args);
    case 'fork':
      telemetry.trackCliSubcommandFork(subcommandOriginal);
      return fork(client, args);
    case 'run':
      telemetry.trackCliSubcommandRun(subcommandOriginal);
      return run(client, args);
    default:
      return runPassThrough(client, argv, commandIndex, sandboxArgs);
  }
}

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

async function runPassThrough(
  client: Client,
  argv: string[],
  commandIndex: number,
  sandboxArgs: string[]
): Promise<number> {
  const rootArgs = commandIndex === -1 ? argv : argv.slice(0, commandIndex);
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
