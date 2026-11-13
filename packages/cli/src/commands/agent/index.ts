import type Client from '../../util/client';
import type { AgentFlags } from './flags';
import output from '../../output-manager';
import {
  buildCommandWithGlobalFlags,
  shouldEmitNonInteractiveCommandError,
  writeAgentError,
} from '../../util/agent-output';
import { getExitCodeForReason } from '../../util/agent-output-constants';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { validateJsonOutput } from '../../util/output-format';
import { AgentTelemetryClient } from '../../util/telemetry/commands/agent';
import { help } from '../help';
import ask from './ask';
import chat from './chat';
import { agentCommand } from './command';
import { AgentError, toAgentError, usageError } from './errors';
import agentInit from './init';

function validate(flags: AgentFlags, prompt: string): void {
  const deciding = flags['--approve'] || flags['--reject'];
  if (flags['--approve'] && flags['--reject'])
    throw usageError('Pass only one of --approve and --reject.');
  if (deciding && !flags['--session'] && !flags['--continue'])
    throw usageError(
      '--approve and --reject need --session <id> or --continue.'
    );
  if (deciding && prompt)
    throw usageError('--approve and --reject do not take a prompt.');
  if (
    flags['--stream'] &&
    validateJsonOutput(flags).valid &&
    (flags['--json'] || flags['--format'])
  )
    throw usageError('Pass only one of --json and --stream.');
  if (
    [flags['--session'], flags['--continue'], flags['--new']].filter(Boolean)
      .length > 1
  )
    throw usageError('Pass only one of --session, --continue and --new.');
}

async function readStdin(stdin: Client['stdin']): Promise<string | undefined> {
  if (stdin.isTTY) return undefined;
  let text = '';
  for await (const chunk of stdin) text += chunk;
  return text;
}

/** The chat when there is nothing to ask and a person at a terminal; otherwise one question. */
async function run(
  client: Client,
  flags: AgentFlags,
  words: Array<string | undefined>,
  json: boolean,
  telemetry: AgentTelemetryClient
): Promise<number> {
  let prompt = words.filter(Boolean).join(' ').trim();
  validate(flags, prompt);
  const deciding = flags['--approve'] || flags['--reject'];
  if (!prompt && !deciding)
    prompt = (await readStdin(client.stdin))?.trim() ?? '';

  const interactive =
    Boolean(client.stdin.isTTY && client.stdout.isTTY) &&
    !client.nonInteractive;
  if (!prompt && !deciding && interactive && !json && !flags['--stream']) {
    telemetry.trackCliMode('chat');
    return chat(client, flags);
  }
  if (!prompt && !deciding && !flags['--session'] && !flags['--continue']) {
    throw new AgentError('missing_arguments', 'Missing prompt.', [
      {
        command: buildCommandWithGlobalFlags(client.argv, 'agent "<question>"'),
      },
    ]);
  }
  telemetry.trackCliMode('ask');
  telemetry.trackCliArgumentPrompt(prompt);
  return ask(client, flags, prompt, json);
}

/** People get a message on stderr; agents and `--json` get Vercel CLI's error payload on stdout. */
function reportError(client: Client, json: boolean, caught: unknown): number {
  const error = toAgentError(caught);
  if (json || shouldEmitNonInteractiveCommandError(client)) {
    writeAgentError(client, {
      status: 'error',
      reason: error.reason,
      message: error.message,
      next: error.next.length ? error.next : undefined,
    });
  } else {
    output.error(error.message);
  }
  return getExitCodeForReason(error.reason);
}

/** `vercel agent`: the chat, a one-shot question, or `init`. */
export default async function agent(client: Client): Promise<number> {
  const telemetry = new AgentTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(agentCommand.options)
    );
  } catch (error) {
    printError(error);
    return 2;
  }
  const { flags } = parsedArgs;

  if (flags['--help']) {
    telemetry.trackCliFlagHelp('agent');
    output.print(
      help(agentCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  // `args[0]` is `agent`. `init` keeps working as before; anything else is the prompt.
  const [, first, ...rest] = parsedArgs.args;
  if (first === 'init') {
    telemetry.trackCliSubcommandInit(first);
    telemetry.trackCliFlagYes(flags['--yes']);
    return agentInit(client, flags['--yes'] ?? false);
  }

  telemetry.trackCliOptionSession(flags['--session']);
  telemetry.trackCliFlagContinue(flags['--continue']);
  telemetry.trackCliFlagNew(flags['--new']);
  telemetry.trackCliFlagApprove(flags['--approve']);
  telemetry.trackCliFlagReject(flags['--reject']);
  telemetry.trackCliOptionProject(flags['--project']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagStream(flags['--stream']);

  const format = validateJsonOutput(flags);
  if (!format.valid) {
    output.error(format.error);
    return 2;
  }
  const json = format.jsonOutput;

  try {
    return await run(client, flags, [first, ...rest], json, telemetry);
  } catch (caught) {
    return reportError(client, json, caught);
  }
}
