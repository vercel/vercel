import type { ErrorReporter } from '../../src/gateways/error-reporter';
import type Client from '../../src/util/client';

/** Records reported errors instead of sending them to Sentry. */
export class FakeErrorReporter implements ErrorReporter {
  #reported: unknown[] = [];

  /** Errors reported so far, in order. */
  get reported(): unknown[] {
    return [...this.#reported];
  }

  async report({
    error,
  }: {
    error: unknown;
    client: Client | undefined;
  }): Promise<void> {
    this.#reported.push(error);
  }
}
