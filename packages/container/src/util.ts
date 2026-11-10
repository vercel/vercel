import { getPlatformEnv } from '@vercel/build-utils';
import type { Span } from '@vercel/build-utils';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

/** Verbose tracing for the container builder, gated on `BUILDER_DEBUG` like every other builder. */
export const DEBUG = Boolean(getPlatformEnv('BUILDER_DEBUG'));

/** Coerce a `command` config value to a string array, or `undefined`. */
export function normalizeCommand(command: unknown): string[] | undefined {
  if (typeof command === 'string') {
    return [command];
  }
  if (
    Array.isArray(command) &&
    command.every(item => typeof item === 'string')
  ) {
    return command;
  }
  return undefined;
}

export function write(line: string): void {
  process.stderr.write(`${line}\n`);
}

/** Top-level milestone, prefixed with the Vercel mark. */
export function info(message: string): void {
  write(`▲ container  ${message}`);
}

/** Something the build ignores or works around, without failing. */
export function warn(message: string): void {
  write(`▲ container  Warning: ${message}`);
}

/** A step that's starting. */
export function step(message: string): void {
  write(`  → ${message}`);
}

/** A step that finished successfully. */
export function done(message: string): void {
  write(`  ✓ ${message}`);
}

export function debug(message: string): void {
  if (DEBUG) {
    write(`  · ${message}`);
  }
}

export function elapsed(since: number): string {
  return `${((Date.now() - since) / 1000).toFixed(1)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/** Shorten a `sha256:…` digest for display. */
export function shortDigest(digest: string): string {
  return digest.startsWith('sha256:') ? `${digest.slice(0, 19)}…` : digest;
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run `fn` inside a child span of `parent` so the container build flow is
 * traceable in the build container. When tracing is disabled (no parent span,
 * e.g. some local invocations) `fn` runs directly.
 */
export async function withSpan<T>(
  parent: Span | undefined,
  name: string,
  attrs: { [key: string]: string | undefined } | undefined,
  fn: (span?: Span) => T | Promise<T>
): Promise<T> {
  if (!parent) {
    return fn(undefined);
  }
  return parent.child(name, attrs).trace(span => fn(span));
}

/** Stringify a value for use as a span tag (tags must be strings). */
export function toTag(value: unknown): string {
  return String(value);
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Recognize explicit Dockerfile/Containerfile paths, with the name anywhere in the basename. */
export function isDockerfileRef(ref: string): boolean {
  return /(docker|container)file/i.test(basename(ref));
}

// Vercel-specific container opt-in markers, auto-discovered when the build
// entrypoint doesn't name a Dockerfile explicitly (e.g. the `container`
// framework preset resolves its entrypoint via `<detect>`). These let a
// project deploy as a container even when another framework is also present.
export const DOCKERFILE_CANDIDATES = [
  'Dockerfile.vercel',
  'Containerfile.vercel',
];

/**
 * Discover a Vercel container opt-in marker (`Dockerfile.vercel` /
 * `Containerfile.vercel`) in `workPath`. Used by both the build and dev paths
 * so they resolve the same Dockerfile when the entrypoint is the `<detect>`
 * sentinel. A conventional `Dockerfile` is deliberately not a marker: only
 * the `.vercel` suffix opts a project out of buildpack or framework builds.
 */
export function findDockerfile(workPath: string): string | undefined {
  return DOCKERFILE_CANDIDATES.find(name => existsSync(join(workPath, name)));
}

/**
 * Stable local image tag for `vercel dev`. Used by both the `build()` path
 * (which never pushes in dev) and `startDevServer` (which builds & runs the
 * image locally), so the two agree on a single name per service.
 */
export function devImageTag(serviceName: string): string {
  const safe = serviceName.toLowerCase().replace(/[^a-z0-9-_.]/g, '-');
  return `vercel-dev/${safe || 'service'}:dev`;
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

/** Rejection from {@link run} carrying the command's exit code. */
export interface RunError extends Error {
  exitCode?: number;
}

/**
 * Run a command, streaming its output to stderr while capturing it for parsing.
 */
export function run(
  cmd: string,
  args: string[],
  opts: {
    cwd?: string;
    input?: string;
    quiet?: boolean;
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: [opts.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (!opts.quiet) {
        process.stderr.write(text);
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (!opts.quiet) {
        process.stderr.write(text);
      }
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            `Command not found: \`${cmd}\`. Ensure \`${cmd}\` is installed and on your PATH.`
          )
        );
        return;
      }
      reject(err);
    });
    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const detail = stderr.trim().split('\n').slice(-5).join('\n');
        const error: RunError = new Error(
          `\`${cmd} ${args.join(' ')}\` exited with code ${code}` +
            (detail ? `\n${detail}` : '')
        );
        error.exitCode = code ?? undefined;
        reject(error);
      }
    });

    if (opts.input !== undefined) {
      child.stdin?.end(opts.input);
    }
  });
}

export async function hasCommand(name: string): Promise<boolean> {
  try {
    await run('which', [name], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

export async function lstatIfPresent(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Pull a `Key: Value` field out of CLI diagnostic text. */
export function extractField(text: string, label: string): string | undefined {
  const match = text.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim();
}

/**
 * Whether we're running inside a Vercel build container rather than a local
 * `vercel build`. `VERCEL_BUILD_IMAGE` is set only on Vercel's build image.
 */
export function isBuildContainer(): boolean {
  return Boolean(readString(process.env.VERCEL_BUILD_IMAGE));
}

/**
 * Locate a pre-existing container registry auth file, if any. The build
 * container provisions `~/.config/containers/auth.json` (vercel/api#76560) that
 * buildah/podman read automatically; `REGISTRY_AUTH_FILE` overrides the
 * location. Returns the existing path, or `undefined` (e.g. local
 * `vercel build`, where an explicit login is still needed).
 */
export function existingRegistryAuthFile(): string | undefined {
  const explicit = readString(process.env.REGISTRY_AUTH_FILE);
  if (explicit) {
    return existsSync(explicit) ? explicit : undefined;
  }
  const fromXdg = readString(process.env.XDG_CONFIG_HOME);
  const configHome = fromXdg || join(homedir(), '.config');
  const defaultPath = join(configHome, 'containers', 'auth.json');
  return existsSync(defaultPath) ? defaultPath : undefined;
}
