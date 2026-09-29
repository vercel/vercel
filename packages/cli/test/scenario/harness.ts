/**
 * Scenario harness: runs the real CLI entry point over in-memory fakes.
 *
 * Keep scenarios in few files. Add new cases to an existing file (for example
 * `whoami.test.ts` or `bootstrap.test.ts`) rather than creating a new one.
 * Vitest isolates each file, so every scenario file pays a one-time module
 * load of about 4-5 s on its first `runScenario`. Most of that is
 * `src/commands-bulk.ts`, which `run-cli.ts` imports to reach many commands.
 * Every later scenario in the same file takes about 1 ms. Create a new file
 * only for a new command family.
 */
import { afterAll, beforeAll } from 'vitest';
import {
  MockAgent,
  getGlobalDispatcher,
  setGlobalDispatcher,
  type Dispatcher,
} from 'undici';
import type Client from '../../src/util/client';
import { runCli } from '../../src/run-cli';
import { MockStream } from '../mocks/mock-stream';
import {
  inMemoryContext,
  type InMemoryCliState,
  type InMemoryFakes,
} from '../fakes/in-memory-context';

export type ScenarioOptions = {
  /** The complete invocation environment. `process.env` is never inherited. */
  env?: Record<string, string | undefined>;
  /** Whether stdout is a TTY. Defaults to `true`. */
  stdoutIsTTY?: boolean;
  /** Whether stdin is a TTY. Defaults to `true`. */
  stdinIsTTY?: boolean;
};

export type ScenarioResult = {
  exitCode: number | undefined;
  stdout: string;
  stderr: string;
  fakes: InMemoryFakes;
  client: Client | undefined;
};

/**
 * Blocks real network access for the current test file. Any request that
 * escapes the fakes fails loudly with the target host in the error.
 */
export function useNetworkGuard(): void {
  let previous: Dispatcher | undefined;
  let agent: MockAgent | undefined;

  beforeAll(() => {
    previous = getGlobalDispatcher();
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });

  afterAll(async () => {
    if (previous) {
      setGlobalDispatcher(previous);
    }
    await agent?.close();
  });
}

/**
 * Runs the real CLI entry point in-process over in-memory fakes. Run one
 * scenario at a time per file: the `output` singleton is process-global.
 */
export async function runScenario(
  args: string[],
  state: InMemoryCliState = {},
  opts: ScenarioOptions = {}
): Promise<ScenarioResult> {
  const { context, fakes } = inMemoryContext(state);

  const stdin = new MockStream();
  stdin.isTTY = opts.stdinIsTTY ?? true;
  const stdout = new MockStream();
  stdout.isTTY = opts.stdoutIsTTY ?? true;
  const stderr = new MockStream();
  // Output is recorded as it is written. Keep the readable sides flowing so
  // large outputs never stall on backpressure.
  stdout.resume();
  stderr.resume();

  const result = await runCli(
    {
      argv: [process.execPath, 'vercel', ...args],
      env: { ...opts.env },
      stdin,
      stdout,
      stderr,
    },
    context
  );

  return {
    exitCode: result.exitCode,
    stdout: stdout.getFullOutput(),
    stderr: stderr.getFullOutput(),
    fakes,
    client: result.client,
  };
}
