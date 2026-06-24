/**
 * Signals that an interactive prompt was intentionally canceled by the user.
 *
 * Keep this separate from prompt-library errors so command flows can provide a
 * stable cancellation outcome without depending on an implementation detail of
 * a particular prompt package.
 */
export class PromptCanceledError extends Error {
  constructor() {
    super('Prompt canceled');
    this.name = 'PromptCanceledError';
  }
}

export function isPromptCanceledError(error: unknown): boolean {
  if (error instanceof PromptCanceledError) {
    return true;
  }

  return (
    error instanceof Error &&
    error.message.includes('User force closed the prompt')
  );
}
