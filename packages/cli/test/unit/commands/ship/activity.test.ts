import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActivityIndicator,
  formatElapsed,
  WORKING_PHRASES,
} from '../../../../src/commands/ship/activity';

describe('ship activity indicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatElapsed', () => {
    it('shows seconds below a minute', () => {
      expect(formatElapsed(8)).toBe('8s');
      expect(formatElapsed(59)).toBe('59s');
    });

    it('shows minutes and padded seconds above one', () => {
      expect(formatElapsed(64)).toBe('1m 04s');
      expect(formatElapsed(601)).toBe('10m 01s');
    });
  });

  describe('the activity clock', () => {
    it('counts from the start of the activity, not the turn', () => {
      // The reported bug: a turn is the whole run in a single-turn session, so
      // a clock started with the turn showed the same number as the total.
      const indicator = new ActivityIndicator();
      indicator.start(WORKING_PHRASES);

      vi.advanceTimersByTime(600_000);
      expect(indicator.elapsedSeconds()).toBe(600);

      indicator.setActivity(['ran vercel build']);
      expect(indicator.elapsedSeconds()).toBe(0);

      vi.advanceTimersByTime(12_000);
      expect(indicator.elapsedSeconds()).toBe(12);
    });

    it('keeps counting when only the wording changes', () => {
      // New detail about the same running command must not restart its clock.
      const indicator = new ActivityIndicator();
      indicator.start(['ran vercel build']);

      vi.advanceTimersByTime(9000);
      indicator.setPhrases(['ran vercel build > Compiling']);

      expect(indicator.elapsedSeconds()).toBe(9);
    });

    it('ignores an activity change before it has started', () => {
      const indicator = new ActivityIndicator();
      indicator.setActivity(['ran something']);

      expect(indicator.elapsedSeconds()).toBe(0);
    });

    it('reports how long it ran when stopped', () => {
      const indicator = new ActivityIndicator();
      indicator.start(WORKING_PHRASES);
      vi.advanceTimersByTime(4000);

      expect(indicator.stop()).toBe(4);
    });
  });
});
