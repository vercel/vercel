import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import output from '../../output-manager';

/**
 * Make the agent's `vercel` be the same CLI that is running `vercel onboard`.
 *
 * The session's approval gate and ledger live in the CLI's own dispatch path,
 * so they only exist if the binary the agent invokes carries them. Relying on
 * `PATH` already pointing at this build is wishful: a globally installed
 * release routinely shadows the copy running onboard (observed on the first
 * real session after the gate shipped — the env variable propagated perfectly
 * and the session directory stayed empty, because every command ran through
 * the old global binary).
 *
 * So onboard writes two shims, `vercel` and `vc`, that exec this process's own
 * entrypoint, and prepends their directory to the session `PATH`. The CLI
 * that supervises is the CLI that executes.
 */
export async function installCliShim(
  sessionDir: string
): Promise<string | undefined> {
  // Windows needs .cmd shims and a different exec model; the fallback there is
  // today's behavior (whatever `vercel` is on PATH), which degrades gracefully.
  if (process.platform === 'win32') {
    return undefined;
  }

  const entrypoint = process.argv[1] ? resolve(process.argv[1]) : undefined;
  if (!entrypoint) {
    return undefined;
  }

  try {
    const binDir = join(sessionDir, 'bin');
    await mkdir(binDir, { recursive: true });

    const script = `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(entrypoint)} "$@"\n`;
    for (const name of ['vercel', 'vc']) {
      const path = join(binDir, name);
      await writeFile(path, script);
      await chmod(path, 0o755);
    }
    return binDir;
  } catch (error) {
    output.debug(
      `onboard: could not install the CLI shim: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
}

/** Single-quote a path for /bin/sh, escaping embedded single quotes. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
