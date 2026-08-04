import chalk from 'chalk';
import output from '../../output-manager';

/** How often the elapsed counter is redrawn. */
const TICK_MS = 1000;

/**
 * Silence required before the indicator reappears after a write.
 *
 * Without it, a stream that emits a line every few hundred milliseconds draws
 * and erases the spinner between every line, which reads as flicker. Waiting
 * means bursts of output stay clean and only a genuine pause gets an indicator.
 */
const IDLE_BEFORE_REDRAW_MS = 700;

/** How long each phrase stays before the next one. */
const PHRASE_MS = 4000;

/**
 * Shown while the agent is working with nothing to print. A rotating phrase and
 * a running clock make a three-minute wait legible instead of looking stalled —
 * the elapsed time is the part that actually reassures, the phrasing just keeps
 * it from feeling like a hang.
 */
export const WORKING_PHRASES = [
  'Working',
  'Digging through the project',
  'Following the trail',
  'Joining the dots',
  'Still going',
  'Making progress',
] as const;

/** Shown while the model is reasoning and has not emitted anything yet. */
export const THINKING_PHRASES = [
  'Thinking',
  'Pondering',
  'Weighing the options',
  'Turning it over',
  'Reasoning it through',
] as const;

/**
 * An animated status line driven by the CLI's existing `ora` spinner.
 *
 * `output.spinner()` waits 300ms before drawing, which this relies on: writes
 * pause and resume the indicator around every line, so a burst of output never
 * draws a spinner at all, while an idle gap gets one. That gives a continuously
 * animated line whenever the agent is quiet, with no flicker in between and no
 * new dependency.
 */
export class ActivityIndicator {
  private timer: NodeJS.Timeout | undefined;
  private idleTimer: NodeJS.Timeout | undefined;
  private startedAt = 0;
  private phrases: readonly string[] = WORKING_PHRASES;
  private running = false;

  /**
   * Animation is skipped when stderr is not a terminal. `output.spinner()` falls
   * back to printing its message as a line, which on a one-second timer would
   * mean hundreds of lines in a log or CI job.
   */
  private get enabled(): boolean {
    return Boolean(process.stderr.isTTY);
  }

  /** Begin animating. Elapsed time runs from here until `stop()`. */
  start(phrases: readonly string[]): void {
    this.phrases = phrases;
    this.startedAt = Date.now();
    this.running = true;
    this.resume();
  }

  /** Whether an indicator is currently drawn. */
  private get drawn(): boolean {
    return this.timer !== undefined;
  }

  /** Swap the phrase set without resetting the clock. */
  setPhrases(phrases: readonly string[]): void {
    if (!this.running) return;
    this.phrases = phrases;
    if (this.drawn) {
      this.draw();
    }
  }

  /** Clear the line so something else can be written to the terminal. */
  pause(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
    output.stopSpinner();
  }

  /** Arm the indicator to reappear once output has been quiet for a moment. */
  resume(): void {
    if (!this.running || !this.enabled || this.timer || this.idleTimer) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      this.draw();
      this.timer = setInterval(() => this.draw(), TICK_MS);
      // Never hold the process open on the animation alone.
      this.timer.unref?.();
    }, IDLE_BEFORE_REDRAW_MS);
    this.idleTimer.unref?.();
  }

  /** Stop animating and return how long it ran, in whole seconds. */
  stop(): number {
    this.pause();
    this.running = false;
    return this.elapsedSeconds();
  }

  elapsedSeconds(): number {
    return this.startedAt === 0
      ? 0
      : Math.round((Date.now() - this.startedAt) / 1000);
  }

  private draw(): void {
    if (!this.enabled) return;
    const seconds = this.elapsedSeconds();
    const phrase =
      this.phrases[
        Math.floor((Date.now() - this.startedAt) / PHRASE_MS) %
          this.phrases.length
      ];
    output.spinner(`${phrase} ${chalk.dim(formatElapsed(seconds))}`, 300);
  }
}

/** `8s`, `1m 04s` — short enough to sit on a spinner line. */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
}
