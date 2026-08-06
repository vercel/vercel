import chalk from 'chalk';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import output from '../../output-manager';
import type { HarnessId } from './detect-harnesses';

interface ContinuationCommands {
  /** Resumes the most recent session in the working directory. */
  latest: string;
  /** Builds an exact resume command for a known session id. */
  byId?: (sessionId: string) => string;
}

/**
 * How to pick a conversation back up with each agent's own CLI.
 *
 * Taken from each CLI's `--help`, not from memory. The picker forms
 * (`claude --resume` with no argument, `codex resume`) are deliberately not
 * offered: a harness drives these CLIs through their SDK, and at least Claude
 * Code records such sessions with `entrypoint: "sdk-ts"` and omits them from its
 * interactive picker. Resuming by explicit id does work, so an id is pinned
 * whenever one can be resolved.
 */
const CONTINUATION: Partial<Record<HarnessId, ContinuationCommands>> = {
  'claude-code': {
    latest: 'claude --continue',
    byId: id => `claude --resume ${id}`,
  },
  codex: { latest: 'codex resume --last', byId: id => `codex resume ${id}` },
  opencode: {
    latest: 'opencode --continue',
    byId: id => `opencode --session ${id}`,
  },
  pi: { latest: 'pi --continue', byId: id => `pi --session ${id}` },
};

/**
 * Print how to carry on with the agent directly, without `vercel ship`.
 *
 * Shown on every exit — success, refusal, error — because a session holds the
 * expensive part: the project inventory and an agreed plan. Ending without
 * telling the user how to get back to it silently throws that away.
 */
export async function printContinuation(options: {
  harnessId: HarnessId;
  harnessLabel: string;
  /** Absolute path the agent was scoped to; the commands are relative to it. */
  workspace: string;
  /** When the session started, so a stale transcript is not offered. */
  startedAt: number;
}): Promise<void> {
  const commands = CONTINUATION[options.harnessId];
  if (!commands) {
    return;
  }

  const sessionId = await resolveSessionId(options);

  output.print('\n');
  output.log(`To continue this session with ${options.harnessLabel} directly:`);
  output.print(`    ${chalk.cyan(`cd ${options.workspace}`)}\n`);

  if (sessionId && commands.byId) {
    output.print(
      `    ${chalk.cyan(commands.byId(sessionId))}${chalk.dim('   this session')}\n`
    );
  }
  output.print(
    `    ${chalk.cyan(commands.latest)}${chalk.dim('   most recent session here')}\n`
  );
  output.print('\n');
}

/**
 * Find the agent's own id for the session that just ran.
 *
 * Only Claude Code is supported: its transcript store is documented by its own
 * `--resume` flag, and the location is derivable. The harness session id is not
 * usable here — it is the framework's handle, and nothing in the adapter's
 * bridge state records the agent-side id — so the newest transcript for this
 * working directory is the only available signal. It is checked against both the
 * recorded `cwd` and the session start time so a stale or unrelated session is
 * never offered.
 *
 * Exported for the native hand-off, which reopens exactly this session in the
 * agent's own interface.
 */
export async function resolveSessionId(options: {
  harnessId: HarnessId;
  workspace: string;
  startedAt: number;
}): Promise<string | undefined> {
  if (options.harnessId !== 'claude-code') {
    return undefined;
  }

  try {
    const dir = join(
      homedir(),
      '.claude',
      'projects',
      encodeProjectPath(options.workspace)
    );

    const transcripts = (await readdir(dir)).filter(name =>
      name.endsWith('.jsonl')
    );

    const withTimes = await Promise.all(
      transcripts.map(async name => {
        const path = join(dir, name);
        return { name, path, mtime: (await stat(path)).mtimeMs };
      })
    );

    // A second of slack: the transcript is created moments after the session.
    const candidates = withTimes
      .filter(entry => entry.mtime >= options.startedAt - 1000)
      .sort((a, b) => b.mtime - a.mtime);

    for (const candidate of candidates) {
      const id = await readSessionId(candidate.path, options.workspace);
      if (id) return id;
    }
  } catch (err) {
    output.debug(
      `ship: could not resolve the agent session id: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  return undefined;
}

/**
 * Read a transcript's own session id, confirming it belongs to this workspace.
 *
 * Only the head of the file is inspected: the fields appear on the first
 * records, and a transcript can be megabytes.
 */
async function readSessionId(
  path: string,
  workspace: string
): Promise<string | undefined> {
  const head = (await readFile(path, 'utf-8')).slice(0, 64_000);

  for (const line of head.split('\n').slice(0, 40)) {
    if (!line.trim()) continue;
    let record: { sessionId?: unknown; cwd?: unknown };
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      typeof record.sessionId === 'string' &&
      record.cwd === workspace &&
      record.sessionId
    ) {
      return record.sessionId;
    }
  }

  return undefined;
}

/**
 * Wait until the agent's transcript store for this workspace stops changing.
 *
 * The native hand-off can follow a graceful mid-turn interrupt, and the agent
 * persists that turn asynchronously while ship is already heading into the
 * hand-off; resuming before the flush lands would show a conversation missing
 * its latest work. Best-effort and bounded: an unreadable store returns
 * immediately, and a store that never settles is resumed anyway after the
 * timeout — a slightly stale resume beats no hand-off.
 */
export async function waitForTranscriptSettle(options: {
  harnessId: HarnessId;
  workspace: string;
  timeoutMs?: number;
  /** Overrides the store location, for tests. */
  transcriptDir?: string;
}): Promise<void> {
  if (options.harnessId !== 'claude-code') {
    return;
  }
  const dir =
    options.transcriptDir ??
    join(
      homedir(),
      '.claude',
      'projects',
      encodeProjectPath(options.workspace)
    );
  const deadline = Date.now() + (options.timeoutMs ?? 4000);

  let previous: string | undefined;
  while (Date.now() < deadline) {
    let fingerprint: string;
    try {
      const entries = (await readdir(dir)).filter(name =>
        name.endsWith('.jsonl')
      );
      const stats = await Promise.all(
        entries.map(async name => {
          const s = await stat(join(dir, name));
          return [name, s.size, s.mtimeMs];
        })
      );
      fingerprint = JSON.stringify(stats.sort());
    } catch {
      return; // No store to wait on.
    }

    if (previous !== undefined && fingerprint === previous) {
      return;
    }
    previous = fingerprint;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

/**
 * Claude Code names each project directory after the absolute path with every
 * non-alphanumeric character replaced by a dash, so `/private/var/folders/_g`
 * becomes `-private-var-folders--g`.
 */
function encodeProjectPath(absolutePath: string): string {
  return absolutePath.replace(/[^a-zA-Z0-9]/g, '-');
}
