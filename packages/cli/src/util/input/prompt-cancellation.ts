/** Signals that an interactive prompt was intentionally canceled. */
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
