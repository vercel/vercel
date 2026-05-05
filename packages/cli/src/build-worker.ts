import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { Agent as HttpsAgent } from 'https';
import { pathToFileURL } from 'url';
import { Span, type Reporter, type TraceEvent } from '@vercel/build-utils';
import { z } from 'zod';
import output from './output-manager';
import Client from './util/client';
import {
  defaultAuthConfig,
  defaultGlobalConfig,
} from './util/config/get-default';
import { TelemetryEventStore } from './util/telemetry';
import {
  runBuildWithInput,
  type ProgrammaticBuildInput,
} from './commands/build';

class InMemoryReporter implements Reporter {
  public events: TraceEvent[] = [];

  report(event: TraceEvent) {
    this.events.push(event);
  }
}

async function readStdin(): Promise<string> {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

const buildWorkerInputSchema = z.object({
  argv: z.array(z.string()),
  cwd: z.string().min(1),
  env: z.record(z.string()),
});

export function parseBuildWorkerInput(raw: string): ProgrammaticBuildInput {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid build worker input: ${message}`);
  }

  const input = buildWorkerInputSchema.safeParse(value);
  if (!input.success) {
    throw new Error(
      `Invalid build worker input: ${
        input.error.issues[0]?.message ?? 'failed validation'
      }`
    );
  }

  return input.data;
}

async function writeTraceDiagnostics(
  client: Client,
  traceReporter: InMemoryReporter
) {
  if (!client.traceDiagnosticsPath) {
    return;
  }

  try {
    await mkdir(join(client.traceDiagnosticsPath, '..'), { recursive: true });
    await writeFile(
      client.traceDiagnosticsPath,
      JSON.stringify(traceReporter.events)
    );
  } catch (error) {
    output.error('Failed to write diagnostics trace file');
    output.prettyError(error);
  }
}

export async function runBuildWorker(
  input: ProgrammaticBuildInput
): Promise<number> {
  const traceReporter = new InMemoryReporter();
  const rootSpan = new Span({ name: 'vc.cli', reporter: traceReporter });
  const telemetryEventStore = new TelemetryEventStore({
    config: defaultGlobalConfig.telemetry,
  });
  const client = new Client({
    agent: new HttpsAgent({ keepAlive: true }),
    apiUrl: 'https://api.vercel.com',
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: output.stream,
    config: defaultGlobalConfig,
    authConfig: { ...defaultAuthConfig, skipWrite: true },
    argv: input.argv,
    telemetryEventStore,
    nonInteractive: false,
  });
  client.rootSpan = rootSpan;

  try {
    return await rootSpan
      .child('vc.cli.command', { command: 'build' })
      .trace(() => runBuildWithInput(client, input));
  } finally {
    rootSpan.stop();
    await writeTraceDiagnostics(client, traceReporter);
    client.agent?.destroy();
  }
}

export async function runBuildWorkerFromStdin(): Promise<number> {
  return runBuildWorker(parseBuildWorkerInput(await readStdin()));
}

function isMainModule(): boolean {
  return Boolean(
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

if (isMainModule()) {
  runBuildWorkerFromStdin()
    .then(exitCode => {
      process.exitCode = exitCode;
    })
    .catch(error => {
      output.prettyError(error);
      process.exitCode = 1;
    });
}
