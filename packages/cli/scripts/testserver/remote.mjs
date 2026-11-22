// What every Testserver runner build mode shares about the sandboxes it runs
// commands in: their region and runtime, the bash scripts, streamed and
// unstreamed command helpers, and the log formatters. Used by
// runner.mjs and the modes in modes/.
import { RunnerError } from './files.mjs';
import { LOCAL_HINT } from './runner-config.mjs';

export const RUNNER_REGION = 'iad1';
export const RUNNER_RUNTIME = 'node22';
export const REMOTE_ROOT = '/vercel/sandbox';
export const OUTPUT_TAIL_LINES = 40;

// The env of every streamed script: no git hooks, prompts or update checks.
const REMOTE_ENV = {
  HUSKY: '0',
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  COREPACK_ENABLE_STRICT: '0',
  npm_config_update_notifier: 'false',
};

/** A bash script of `lines`, failing on the first error, run in REMOTE_ROOT. */
export const bashScript = lines =>
  ['set -euo pipefail', `cd ${REMOTE_ROOT}`, ...lines].join('\n');

export const secs = ms => `${(ms / 1000).toFixed(1)}s`;
export const megabytes = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function tail(text, lines = OUTPUT_TAIL_LINES) {
  return text.split('\n').slice(-lines).join('\n');
}

/** Rewrite runner paths under `remoteRoot` to the same paths under `localRoot`. */
export function rewriteRemotePaths(text, remoteRoot, localRoot) {
  const from = `${remoteRoot.replace(/\/+$/, '')}/`;
  const to = `${localRoot.replace(/\/+$/, '')}/`;
  return text.split(from).join(to);
}

/**
 * Splits a byte stream into lines so path rewriting never sees half a path.
 * `push` returns complete lines; `flush` returns the rest.
 */
export function lineSplitter() {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk;
      const end = buffer.lastIndexOf('\n');
      if (end === -1) return '';
      const lines = buffer.slice(0, end + 1);
      buffer = buffer.slice(end + 1);
      return lines;
    },
    flush() {
      const rest = buffer;
      buffer = '';
      return rest;
    },
  };
}

/**
 * A horizontal rule with `text` in it, at least `width` columns wide. Marks
 * where output streamed from a remote sandbox starts and ends.
 */
export function outputRule(text, width = 80) {
  const head = `── ${text} `;
  return head + '─'.repeat(Math.max(2, width - head.length));
}

/**
 * Run a command in `sandbox` without streaming it. Throws RunnerError with
 * the output tail when it exits non-zero.
 */
export async function runChecked(sandbox, label, cmd, args, opts = {}) {
  const result = await sandbox.runCommand({ cmd, args, ...opts });
  if (result.exitCode !== 0) {
    const output = (await result.output('both').catch(() => '')).trim();
    throw new RunnerError(
      `${label} failed in the runner (exit ${result.exitCode})${
        output ? `:\n${tail(output)}` : ''
      }`,
      { hint: LOCAL_HINT }
    );
  }
  return result;
}

const stagingDirs = new WeakMap();

/**
 * The directory in `sandbox` where uploads and downloads are staged, made
 * once per sandbox by its `mktemp -d`, so no fixed path is shared or reused.
 * Resolves to its absolute path.
 */
export function stagingDir(sandbox) {
  let dir = stagingDirs.get(sandbox);
  if (!dir) {
    dir = runChecked(sandbox, 'Creating a staging directory', 'mktemp', [
      '-d',
      '-t',
      'testserver.XXXXXXXX',
    ]).then(async result => (await result.stdout()).trim());
    // A failed mktemp is retried on the next call rather than cached.
    dir.catch(() => stagingDirs.delete(sandbox));
    stagingDirs.set(sandbox, dir);
  }
  return dir;
}

/** The path of `name` in `sandbox`'s staging directory. */
export async function stagingPath(sandbox, name) {
  return `${await stagingDir(sandbox)}/${name}`;
}

/**
 * Run a bash `script` in `sandbox`, logging each output line with `prefix`.
 * Returns `{ exitCode, tail }`, `tail` being the last output lines.
 */
export async function streamScript(sandbox, { script, prefix, log, signal }) {
  const command = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', script],
    cwd: REMOTE_ROOT,
    env: REMOTE_ENV,
    detached: true,
  });
  const lines = [];
  const emit = text => {
    for (const line of text.split('\n')) {
      if (!line) continue;
      lines.push(line);
      if (lines.length > OUTPUT_TAIL_LINES) lines.shift();
      log(`${prefix} ${line}`);
    }
  };
  const splitters = { stdout: lineSplitter(), stderr: lineSplitter() };
  for await (const { stream, data } of command.logs({ signal })) {
    emit(splitters[stream].push(data));
  }
  emit(splitters.stdout.flush());
  emit(splitters.stderr.flush());
  const { exitCode } = await command.wait({ signal });
  return { exitCode: exitCode ?? 1, tail: lines.join('\n') };
}

/**
 * `streamScript` for one named step; throws RunnerError with the output tail
 * when it fails. `where` names the sandbox in the error. Returns its ms.
 */
export async function runStep(sandbox, { label, where, ...options }) {
  const startedAt = Date.now();
  const { exitCode, tail: output } = await streamScript(sandbox, options);
  if (exitCode !== 0) {
    throw new RunnerError(
      `${label} failed in ${where} (exit ${exitCode})${output ? `:\n${output}` : ''}`,
      { hint: LOCAL_HINT }
    );
  }
  return Date.now() - startedAt;
}
