import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PhaseTimings } from '../progress-events';

// Front attaches testserver.log and factories.log to its Playwright report.
// Vitest has no attachments, so on failure these go to disk instead.

const testserverRoot = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '..'
);
export const resultsRoot = join(testserverRoot, '.results');

export interface FactoryRecord {
  path: string;
  data: unknown;
  options: unknown;
  response: unknown;
}

export interface ProxyRequestRecord {
  method: string;
  url: string;
  status: number;
  ms: number;
  body?: string;
}

export interface CliRunRecord {
  args: string[];
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ArtifactRecorder {
  phases: PhaseTimings;
  factories: FactoryRecord[];
  requests: ProxyRequestRecord[];
  cliRuns: CliRunRecord[];
  testserverLog?: unknown;
}

export function createArtifactRecorder(): ArtifactRecorder {
  return {
    phases: {
      containerMs: 0,
      seedMs: 0,
      seedCalls: 0,
      authMs: 0,
      cliMs: 0,
      cliRuns: 0,
    },
    factories: [],
    requests: [],
    cliRuns: [],
  };
}

function collectSecrets(factories: FactoryRecord[]): string[] {
  const secrets = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'secretString' && typeof child === 'string' && child) {
          secrets.add(child);
        } else {
          visit(child);
        }
      }
    }
  };
  for (const f of factories) visit(f.response);
  return [...secrets];
}

function redact(payload: unknown, secrets: string[]): string {
  let text = JSON.stringify(payload ?? null, null, 2);
  for (const secret of secrets) {
    text = text.split(secret).join('[REDACTED]');
  }
  return `${text}\n`;
}

/**
 * Write the failure artifacts for one test and print a single stderr line
 * pointing at them. Every token `secretString` seen in factory responses is
 * redacted from all files.
 */
export function writeArtifacts({
  file,
  testId,
  base,
  recorder,
}: {
  file: string;
  testId: string;
  base: string;
  recorder: ArtifactRecorder;
}): string {
  const relFile = relative(testserverRoot, resolve(file))
    .split(/[\\/]/)
    .join('__');
  const dir = join(resultsRoot, relFile, testId);
  mkdirSync(dir, { recursive: true });

  const secrets = collectSecrets(recorder.factories);
  const files: Record<string, unknown> = {
    'testserver.log.json': recorder.testserverLog ?? null,
    'factories.log.json': recorder.factories,
    'requests.json': recorder.requests,
    'cli.json': recorder.cliRuns,
  };
  for (const [name, payload] of Object.entries(files)) {
    writeFileSync(join(dir, name), redact(payload, secrets));
  }

  process.stderr.write(
    `[testserver] failed: test-id=${testId} base=${base} logs=${base}/raw?testId=${testId} artifacts=${dir}\n`
  );
  return dir;
}
