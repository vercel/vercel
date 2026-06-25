/** Signals that an interactive prompt was intentionally canceled. */
export class PromptCanceledError extends Error {
  constructor() {
    super('Prompt canceled');
    this.name = 'PromptCanceledError';
  }
}

/** Signals that an interactive prompt should return to its previous choice. */
export class PromptBackError extends Error {
  constructor() {
    super('Prompt back');
    this.name = 'PromptBackError';
  }
}

export function isPromptBackError(error: unknown): boolean {
  return error instanceof PromptBackError;
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
