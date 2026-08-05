import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import type { HarnessLoader } from './install-harness-packages';

/** Tool name the agent calls. Also the key it is registered under. */
export const ASK_USER_TOOL = 'askUser';

/**
 * Match the ask-user tool by name, tolerating a namespace prefix.
 *
 * The harness exposes host tools to the agent through an MCP server, so the
 * agent's own transcript records this call as `mcp__harness-tools__askUser`. The
 * AI SDK stream reports the key it was registered under, but matching only the
 * bare name would break silently — the turn would be left waiting forever — if
 * that ever changed.
 */
export function isAskUserTool(toolName: string | undefined): boolean {
  if (!toolName) return false;
  return toolName === ASK_USER_TOOL || toolName.endsWith(`__${ASK_USER_TOOL}`);
}

/** Appended to every question so the user is never boxed in by the options. */
const FREEFORM_LABEL = 'Something else…';

export interface AskUserInput {
  question: string;
  options?: { label: string; description?: string }[];
  multiSelect?: boolean;
}

/**
 * A host-executed tool the agent can call to ask a structured question.
 *
 * Claude Code has a native `AskUserQuestion` tool, but it is a *builtin* — it
 * runs inside the agent and expects the agent's own UI, which does not exist
 * behind the SDK bridge. Registering our own tool instead works the same way on
 * every harness and lets the CLI own the rendering: a real select or checkbox
 * rather than asking the user to type an answer and hoping it parses.
 *
 * The tool declares no `execute`, which is what makes the harness pause the turn
 * and wait for a result supplied from here.
 */
export async function createAskUserTool(
  loader: HarnessLoader
): Promise<Record<string, unknown> | undefined> {
  try {
    const [ai, zodModule] = await Promise.all([
      loader.loadAi(),
      loader.loadZod(),
    ]);

    const tool = ai.tool as (definition: unknown) => unknown;
    const z = (zodModule.z ?? zodModule.default ?? zodModule) as {
      object: (shape: Record<string, unknown>) => unknown;
      string: () => {
        optional: () => unknown;
        describe: (d: string) => unknown;
      };
      boolean: () => { optional: () => unknown };
      array: (item: unknown) => { optional: () => unknown };
    };

    if (typeof tool !== 'function' || !z?.object) {
      return undefined;
    }

    output.debug(`ship: registered the ${ASK_USER_TOOL} tool`);

    return {
      [ASK_USER_TOOL]: tool({
        description:
          'Ask the user a question and let them pick from options. Use this for ' +
          'every question you put to the user: choices, approvals, ' +
          'confirmations, missing values. Never ask in prose instead, and never ' +
          'end a turn with a question; both force the user to type an answer ' +
          'that could have been a keystroke, and cost a round trip. Supply 2 or ' +
          'more concise options, best first, with any consequence in the option ' +
          'description rather than the label. Set multiSelect when more than ' +
          'one may be chosen. A free-text choice is added for you, and the user ' +
          'can always answer freely instead of choosing.',
        inputSchema: z.object({
          question: z.string(),
          options: z.array(
            z.object({
              label: z.string(),
              description: z.string().optional(),
            })
          ),
          multiSelect: z.boolean().optional(),
        }),
      }),
    };
  } catch (err) {
    // A missing or incompatible `ai`/`zod` must not stop a session; the agent
    // falls back to asking in prose, which the reply loop already handles.
    output.debug(
      `ship: could not build the ${ASK_USER_TOOL} tool: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return undefined;
  }
}

/**
 * Render a question and return the tool result to hand back to the agent.
 */
export async function answerAskUser(
  client: Client,
  rawInput: unknown
): Promise<{ answer: string }> {
  const input = normalizeInput(rawInput);

  if (!client.stdin.isTTY) {
    output.log(`${input.question}`);
    output.warn(
      'Cannot ask questions without an interactive terminal; telling the agent so.'
    );
    return {
      answer:
        'No interactive terminal is available, so the user could not answer. ' +
        'Do not ask further questions; either proceed with a clearly stated ' +
        'assumption or stop and summarize what input you need.',
    };
  }

  output.print('\n');

  const choices = [
    ...input.options.map(option => ({
      name: option.description
        ? `${option.label} ${chalk.dim(`(${option.description})`)}`
        : option.label,
      value: option.label,
    })),
    { name: chalk.dim(FREEFORM_LABEL), value: FREEFORM_LABEL },
  ];

  if (input.multiSelect) {
    const picked = await client.input.checkbox<string>({
      message: input.question,
      choices,
    });

    if (picked.includes(FREEFORM_LABEL)) {
      const extra = await readFreeform(client);
      const rest = picked.filter(value => value !== FREEFORM_LABEL);
      return {
        answer: [...rest, extra].filter(Boolean).join('; ') || extra,
      };
    }

    return { answer: picked.join('; ') };
  }

  const picked = await client.input.select<string>({
    message: input.question,
    choices,
  });

  if (picked === FREEFORM_LABEL) {
    return { answer: await readFreeform(client) };
  }

  return { answer: picked };
}

async function readFreeform(client: Client): Promise<string> {
  const reply = await client.input.text({ message: 'Your answer:' });
  return reply.trim();
}

/**
 * Coerce whatever the model sent into something renderable.
 *
 * Models get schemas slightly wrong — a bare string, a missing `options`, one
 * option instead of two. Prompting must not crash on that, and a question with
 * too few options degrades to a free-text answer rather than an error.
 */
function normalizeInput(raw: unknown): Required<AskUserInput> {
  const value = (raw ?? {}) as Record<string, unknown>;

  const question =
    typeof value.question === 'string' && value.question.trim()
      ? value.question.trim()
      : 'The agent asked a question but did not include its text.';

  const options = Array.isArray(value.options)
    ? value.options
        .map(option => {
          if (typeof option === 'string') return { label: option };
          const record = (option ?? {}) as Record<string, unknown>;
          const label =
            typeof record.label === 'string' ? record.label.trim() : '';
          const description =
            typeof record.description === 'string'
              ? record.description.trim()
              : undefined;
          return label ? { label, description } : undefined;
        })
        .filter((option): option is { label: string; description?: string } =>
          Boolean(option)
        )
    : [];

  return {
    question,
    options,
    multiSelect: value.multiSelect === true,
  };
}
