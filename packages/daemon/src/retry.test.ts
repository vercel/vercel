import { describe, it, expect, beforeEach } from 'vitest';
import { RetryStrategy } from './retry';

describe('RetryStrategy', () => {
  let retry: RetryStrategy;

  beforeEach(() => {
    retry = new RetryStrategy();
  });

  describe('getNextDelay', () => {
    it('should return 1 minute (60000ms) on first attempt', () => {
      const delay = retry.getNextDelay();
      expect(delay).toBe(60000);
    });

    it('should return exponential backoff delays', () => {
      const delays = [];
      for (let i = 0; i < 5; i++) {
        delays.push(retry.getNextDelay());
      }

      // 1min, 2min, 4min, 8min, 15min (capped)
      expect(delays).toEqual([
        60000, // 1 min
        120000, // 2 min
        240000, // 4 min
        480000, // 8 min
        900000, // 15 min (capped at max)
      ]);
    });

    it('should cap at max delay of 15 minutes', () => {
      // Exhaust attempts to get to max
      for (let i = 0; i < 10; i++) {
        retry.getNextDelay();
      }

      // All subsequent delays should be capped at 15 minutes
      expect(retry.getNextDelay()).toBe(900000);
      expect(retry.getNextDelay()).toBe(900000);
    });

    it('should increment attempt counter', () => {
      retry.getNextDelay(); // attempt 0 -> 1, returns 60000
      retry.getNextDelay(); // attempt 1 -> 2, returns 120000
      retry.getNextDelay(); // attempt 2 -> 3, returns 240000

      // Verify by checking the delay (which depends on attempt count)
      const delay = retry.getNextDelay(); // attempt 3 -> 4, returns 480000
      expect(delay).toBe(480000); // 8 minutes
    });
  });

  describe('reset', () => {
    it('should reset attempt counter to 0', () => {
      // Make several attempts
      retry.getNextDelay();
      retry.getNextDelay();
      retry.getNextDelay();

      // Reset
      retry.reset();

      // Next delay should be back to 1 minute
      expect(retry.getNextDelay()).toBe(60000);
    });

    it('should allow retry after reset', () => {
      // Exhaust max attempts
      for (let i = 0; i < 10; i++) {
        retry.getNextDelay();
      }

      expect(retry.shouldRetry()).toBe(false);

      // Reset
      retry.reset();

      // Should be able to retry again
      expect(retry.shouldRetry()).toBe(true);
    });
  });

  describe('shouldRetry', () => {
    it('should return true when under max attempts', () => {
      expect(retry.shouldRetry()).toBe(true);

      retry.getNextDelay();
      expect(retry.shouldRetry()).toBe(true);

      retry.getNextDelay();
      expect(retry.shouldRetry()).toBe(true);
    });

    it('should return false when max attempts reached', () => {
      // Max attempts is 10
      for (let i = 0; i < 10; i++) {
        retry.getNextDelay();
      }

      expect(retry.shouldRetry()).toBe(false);
    });

    it('should return false for subsequent calls after max attempts', () => {
      // Exhaust attempts
      for (let i = 0; i < 15; i++) {
        retry.getNextDelay();
      }

      expect(retry.shouldRetry()).toBe(false);
      expect(retry.shouldRetry()).toBe(false);
      expect(retry.shouldRetry()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple reset cycles', () => {
      // First cycle
      retry.getNextDelay();
      retry.getNextDelay();
      retry.reset();

      // Second cycle
      retry.getNextDelay();
      retry.getNextDelay();
      retry.reset();

      // Third cycle should start fresh
      expect(retry.getNextDelay()).toBe(60000);
      expect(retry.shouldRetry()).toBe(true);
    });

    it('should maintain correct state across mixed operations', () => {
      retry.getNextDelay(); // 60000
      expect(retry.shouldRetry()).toBe(true);

      retry.getNextDelay(); // 120000
      expect(retry.shouldRetry()).toBe(true);

      retry.reset();
      expect(retry.shouldRetry()).toBe(true);

      retry.getNextDelay(); // 60000
      expect(retry.getNextDelay()).toBe(120000);
      expect(retry.shouldRetry()).toBe(true);
    });
  });

  describe('deterministic behavior', () => {
    it('should produce identical delays for identical sequences', () => {
      const retry1 = new RetryStrategy();
      const retry2 = new RetryStrategy();

      const delays1 = [];
      const delays2 = [];

      for (let i = 0; i < 8; i++) {
        delays1.push(retry1.getNextDelay());
        delays2.push(retry2.getNextDelay());
      }

      expect(delays1).toEqual(delays2);
    });

    it('should have predictable state transitions', () => {
      // Test the exact exponential backoff formula: baseDelay * 2^attempts
      const retry = new RetryStrategy();
      const baseDelay = 60000; // 1 minute
      const maxDelay = 900000; // 15 minutes

      for (let attempt = 0; attempt < 10; attempt++) {
        const expectedDelay = Math.min(
          baseDelay * Math.pow(2, attempt),
          maxDelay
        );
        const actualDelay = retry.getNextDelay();
        expect(actualDelay).toBe(expectedDelay);
      }
    });
  });
});
