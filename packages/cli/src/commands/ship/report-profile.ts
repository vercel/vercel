import { join } from 'node:path';
import getGlobalPathConfig from '../../util/config/global-path';
import output from '../../output-manager';
import pkg from '../../util/pkg';
import type { ShipProfile } from './profile';

/** Where written profiles live, under the directory the CLI already owns. */
function getProfilesDir(): string {
  return join(getGlobalPathConfig(), 'ship-profiles');
}

/**
 * Print the timing breakdown and write the full profile.
 *
 * Kept out of `profile.ts` so that module stays a recorder with no opinion
 * about where a profile goes or when one is worth keeping.
 *
 * Nothing is written for a run that never started a session. `--list-harnesses`
 * and `--print-prompt` finish in milliseconds and their timings are noise; the
 * point of a profile is the minutes an agent session spends somewhere.
 */
export async function reportProfile(
  profile: ShipProfile,
  exitCode: number
): Promise<void> {
  if (!profile.has('session')) {
    output.debug(`ship: finished in ${profile.totalMs}ms`);
    return;
  }

  // The activity indicator may still own the line, including on the abort path.
  output.stopSpinner();

  profile.set('command', 'vercel ship');
  profile.set('cliVersion', pkg.version);
  profile.set('exitCode', exitCode);
  profile.set('platform', `${process.platform}-${process.arch}`);
  profile.set('node', process.version);

  output.print('\n');
  output.print(`${profile.format()}\n`);

  const path = await profile.write(getProfilesDir(), profileFilename());
  if (path) {
    output.print(`\n  Full profile: ${path}\n`);
  }
  output.print('\n');
}

/**
 * Leading ISO timestamp, so the directory sorts chronologically and pruning the
 * oldest is a lexical sort.
 *
 * The process id disambiguates the rest. Two sessions can finish in the same
 * millisecond, which is not hypothetical: signalling several runs at once is
 * exactly what a `pkill` does, and without this the profiles overwrite each
 * other and the survivor is attributed to whichever run printed the path.
 */
function profileFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${stamp}-${process.pid}.json`;
}

/** Conventional shell exit codes for a signalled process. */
const SIGNAL_EXIT_CODE: Record<string, number> = {
  SIGINT: 130,
  SIGTERM: 143,
};

/** How long the profile gets to reach disk before the process exits anyway. */
const ABORT_WRITE_TIMEOUT_MS = 3000;

/**
 * Report the profile when the run is interrupted, then exit.
 *
 * Without this, Ctrl-C takes Node's default path and the process is gone before
 * any `finally` runs, so the run most worth measuring — the slow one someone
 * gave up on — is the one that produces nothing.
 *
 * Installing a handler means Node no longer exits on its own, so this owns the
 * exit. A second signal exits immediately, and the write is bounded, so an
 * unresponsive disk cannot turn Ctrl-C into a hang.
 *
 * Returns a function that removes the handlers.
 */
export function reportProfileOnAbort(profile: ShipProfile): () => void {
  let handling = false;

  const onSignal = (signal: NodeJS.Signals) => {
    const code = SIGNAL_EXIT_CODE[signal] ?? 130;

    if (handling) {
      process.exit(code);
    }
    handling = true;
    profile.set('abortedBy', signal);

    void (async () => {
      try {
        await Promise.race([
          reportProfile(profile, code),
          new Promise(resolve => {
            setTimeout(resolve, ABORT_WRITE_TIMEOUT_MS).unref?.();
          }),
        ]);
      } catch (err) {
        output.debug(
          `ship: could not report the profile on ${signal}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
      process.exit(code);
    })();
  };

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  return () => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  };
}
