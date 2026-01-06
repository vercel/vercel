export class RetryStrategy {
  private attempts = 0;
  private maxAttempts: number;
  private baseDelay = 60000; // 1 minute
  private maxDelay = 900000; // 15 minutes

  /**
   * Create a retry strategy
   * @param maxAttempts Maximum retry attempts (Infinity for unlimited retries)
   */
  constructor(maxAttempts = 10) {
    this.maxAttempts = maxAttempts;
  }

  /**
   * Get the next retry delay using exponential backoff.
   * Formula: baseDelay * 2^attempts, capped at maxDelay
   */
  getNextDelay(): number {
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.attempts),
      this.maxDelay
    );
    this.attempts++;
    return delay;
  }

  /**
   * Reset the retry counter after a successful operation
   */
  reset(): void {
    this.attempts = 0;
  }

  /**
   * Check if we should continue retrying
   */
  shouldRetry(): boolean {
    return this.attempts < this.maxAttempts;
  }

  /**
   * Get the current attempt number (useful for logging)
   */
  getAttempts(): number {
    return this.attempts;
  }
}
