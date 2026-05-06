import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { Agent as HttpsAgent } from 'https';
import type { Readable } from 'stream';
import { Span, type Reporter, type TraceEvent } from '@vercel/build-utils';
import { z } from 'zod';
import output from './output-manager';
import Client from './util/client';
import {
  defaultAuthConfig,
  defaultGlobalConfig,
} from './util/config/get-default';
import { TelemetryEventStore } from './util/telemetry';
import buildCommand from './commands/build';

class InMemoryReporter implements Reporter {
  public events: TraceEvent[] = [];

  report(event: TraceEvent) {
    this.events.push(event);
  }
}

async function readStream(stream: Readable): Promise<string> {
  stream.setEncoding('utf8');
  let input = '';
  for await (const chunk of stream) {
    input += chunk;
  }
  return input;
}

export interface ProgrammaticCommandInput {
  argv: string[];
  cwd: string;
  env: Record<string, string>;
}

const commandWorkerInputSchema = z.object({
  argv: z.array(z.string()),
  cwd: z.string().min(1),
  env: z.record(z.string()),
});

export async function parseCommandWorkerInput(
  stream: Readable
): Promise<ProgrammaticCommandInput> {
  let value: unknown;
  try {
    value = JSON.parse(await readStream(stream));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid command worker input: ${message}`);
  }

  const input = commandWorkerInputSchema.safeParse(value);
  if (!input.success) {
    throw new Error(
      `Invalid command worker input: ${
        input.error.issues[0]?.message ?? 'failed validation'
      }`
    );
  }

  return input.data;
}

export function replaceProcessEnv(env: Record<string, string>): () => void {
  const originalEnv = { ...process.env };

  for (const key of Object.keys(process.env)) {
    if (!Object.prototype.hasOwnProperty.call(env, key)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  return () => {
    for (const key of Object.keys(process.env)) {
      if (!Object.prototype.hasOwnProperty.call(originalEnv, key)) {
        delete process.env[key];
      }
    }

    Object.assign(process.env, originalEnv);
  };
}

export async function runCommandWithInput(
  client: Client,
  input: ProgrammaticCommandInput,
  runCommand: (client: Client) => Promise<number>
): Promise<number> {
  const restoreEnv = replaceProcessEnv(input.env);
  const originalCwd = process.cwd();
  const originalClientArgv = client.argv;
  const originalClientCwd = client.cwd;

  try {
    process.chdir(input.cwd);
    client.cwd = input.cwd;
    client.argv = input.argv;
    return await runCommand(client);
  } finally {
    client.argv = originalClientArgv;
    client.cwd = originalClientCwd;
    process.chdir(originalCwd);
    restoreEnv();
  }
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

export async function runCommandWorker(
  input: ProgrammaticCommandInput
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
    const command = input.argv[2];
    if (command !== 'build') {
      throw new Error(
        `Unsupported command worker command: ${command ?? '<default>'}`
      );
    }

    return await runCommandWithInput(client, input, client =>
      rootSpan
        .child('vc.cli.command', { command })
        .trace(() => buildCommand(client))
    );
  } finally {
    rootSpan.stop();
    await writeTraceDiagnostics(client, traceReporter);
    client.agent?.destroy();
  }
}
