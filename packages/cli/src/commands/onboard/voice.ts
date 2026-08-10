import chalk from 'chalk';

/**
 * Width of the label column, before the two spaces separating it from the text.
 *
 * Labels are right-aligned in it, so the text column never moves and the whole
 * transcript can be read down one edge.
 */
const LABEL_WIDTH = 8;

/** Total columns consumed before any text. */
export const GUTTER_WIDTH = LABEL_WIDTH + 2;

/**
 * Who or what produced a line.
 *
 * A session has three actors and the transcript has always rendered them as one
 * undifferentiated column, which leaves the two questions that matter
 * unanswered: whether Vercel or the agent decided something, and what actually
 * ran on the machine.
 *
 * - `vercel`  the CLI itself: orchestration, results, errors
 * - `agent`   whichever harness is driving, named so it is never mistaken for
 *             an agent Vercel built
 * - `action`  something executed on the user's machine, labelled with the verb
 *             that describes it
 * - `you`     an answer the user gave
 */
export type Actor = 'vercel' | 'agent' | 'action' | 'you';

const TINT: Record<Actor, (value: string) => string> = {
  vercel: chalk.magenta,
  agent: chalk.cyan,
  action: chalk.dim,
  you: chalk.green,
};

/**
 * Render the label column for a line.
 *
 * `label` is the actor's name for `agent`, the verb for an `action`.
 */
export function gutter(actor: Actor, label: string): string {
  const text = label.length > LABEL_WIDTH ? label.slice(0, LABEL_WIDTH) : label;
  return `${TINT[actor](text.padStart(LABEL_WIDTH))}  `;
}

/** The same width in blank space, for continuation lines. */
export function blankGutter(): string {
  return ' '.repeat(GUTTER_WIDTH);
}

/**
 * The verb describing what a tool call does, used as its label.
 *
 * A verb rather than the tool's own name, because the point of the column is
 * what happened to the machine, not which implementation did it. Tool names
 * vary between harnesses; the verbs do not.
 */
export function actionVerb(toolName: string): string {
  const name = toolName.toLowerCase().replace(/^mcp__[^_]*__/, '');

  switch (name) {
    case 'bash':
    case 'shell':
    case 'exec':
    case 'run':
      return 'ran';
    case 'read':
    case 'readfile':
    case 'view':
      return 'read';
    case 'write':
    case 'writefile':
    case 'create':
      return 'wrote';
    case 'edit':
    case 'multiedit':
    case 'str_replace':
    case 'apply_patch':
      return 'edited';
    case 'glob':
    case 'grep':
    case 'search':
    case 'find':
      return 'searched';
    case 'webfetch':
    case 'fetch':
    case 'websearch':
      return 'fetched';
    case 'task':
    case 'agent':
      return 'delegated';
    case 'todowrite':
    case 'todoread':
      return 'planned';
    default:
      return name.length > LABEL_WIDTH ? name.slice(0, LABEL_WIDTH) : name;
  }
}

/**
 * Short name for a harness, used as the agent's label.
 *
 * `claude-code` reads as `claude` in a column this narrow, and the version and
 * full name are already in the opening frame.
 */
export function agentLabel(harnessId: string): string {
  const [first] = harnessId.split('-');
  return first.length > LABEL_WIDTH ? first.slice(0, LABEL_WIDTH) : first;
}
