import type Client from '../../util/client';
import { help } from '../help';
import { commandsStructs } from '..';
import { globalCommandOptions } from '../../util/arg-common';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName, packageName } from '../../util/pkg-name';
import output from '../../output-manager';
import { CompletionTelemetryClient } from '../../util/telemetry/commands/completion';
import { complete } from '../../util/completion/complete';
import { resolveCompletionSource } from '../../util/completion/sources';
import {
  SUPPORTED_SHELLS,
  type SupportedShell,
  completionScript,
  isSupportedShell,
} from '../../util/completion/scripts';
import {
  detectShell,
  fpathHintFor,
  writeCompletionFiles,
} from '../../util/completion/install';
import { completionCommand } from './command';

async function runInstall(
  client: Client,
  telemetry: CompletionTelemetryClient,
  shellArg: string | undefined
): Promise<number> {
  telemetry.trackCliSubcommandInstall();

  if (shellArg && !isSupportedShell(shellArg)) {
    output.error(
      `Unsupported shell "${shellArg}". Supported shells: ${SUPPORTED_SHELLS.join(
        ', '
      )}.`
    );
    return 1;
  }

  const shell = detectShell(shellArg);
  telemetry.trackCliArgumentShell(shell);

  if (!shell) {
    output.error(
      `Could not detect your shell from $SHELL. Run ${getCommandName(
        'completion install <shell>'
      )} with one of: ${SUPPORTED_SHELLS.join(', ')}.`
    );
    return 1;
  }

  let paths: string[];
  try {
    paths = await writeCompletionFiles(shell);
  } catch (error) {
    printError(error);
    return 1;
  }

  output.success(`Installed ${shell} completion for the Vercel CLI:`);
  for (const path of paths) {
    output.log(`  ${path}`);
  }

  const hint = fpathHintFor(shell);
  if (hint) {
    output.log(
      "If completions don't load, add this to your ~/.zshrc before `compinit`:"
    );
    output.log(`  ${hint}`);
  }

  output.log('Restart your shell or open a new terminal to start using it.');
  return 0;
}

export default async function completion(client: Client): Promise<number> {
  const telemetry = new CompletionTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const argv = client.argv.slice(2);

  // Hidden driver path: `completion __complete -- <words>`. This runs on every
  // TAB, so it must stay silent: only candidates go to stdout, nothing else.
  //
  // The words after `--` are read raw, NOT through parseArguments: they are the
  // line being completed, so flag-like tokens (`--sc`) and a trailing empty word
  // must reach the engine verbatim. The generated shell scripts always call
  // `<binary> completion __complete -- <tokens>` with no flags of their own, so
  // any global flag a user typed (e.g. `vercel --debug ...`) sits before
  // `__complete` and is correctly excluded from the completion words.
  const completeIdx = argv.indexOf('__complete');
  if (completeIdx !== -1) {
    let words = argv.slice(completeIdx + 1);
    if (words[0] === '--') {
      words = words.slice(1);
    }
    const candidates = await complete(words, {
      commands: commandsStructs,
      globalOptions: globalCommandOptions,
      resolveSource: source => resolveCompletionSource(source, client),
    });
    if (candidates.length > 0) {
      client.stdout.write(`${candidates.join('\n')}\n`);
    }
    return 0;
  }

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(completionCommand.options)
    );
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('completion');
    output.print(help(completionCommand, { columns: client.stderr.columns }));
    return 2;
  }

  // args[0] is the command name ("completion").
  const sub = parsedArgs.args[1];

  if (sub === 'install') {
    return runInstall(client, telemetry, parsedArgs.args[2]);
  }

  // Script generation path: `completion <shell>`.
  const shell = sub;
  telemetry.trackCliArgumentShell(shell);

  if (!shell) {
    output.error(
      `Missing shell argument. Run ${getCommandName(
        'completion <shell>'
      )} where <shell> is one of: ${SUPPORTED_SHELLS.join(
        ', '
      )}, or ${getCommandName('completion install')} to set it up automatically.`
    );
    return 1;
  }

  if (!isSupportedShell(shell)) {
    output.error(
      `Unsupported shell "${shell}". Supported shells: ${SUPPORTED_SHELLS.join(
        ', '
      )}.`
    );
    return 1;
  }

  const supportedShell: SupportedShell = shell;
  client.stdout.write(completionScript(supportedShell, packageName));
  return 0;
}
