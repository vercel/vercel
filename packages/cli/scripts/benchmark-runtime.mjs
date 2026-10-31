import assert from 'node:assert/strict';
import { resolve } from 'node:path';

export function benchmarkRuntime(entry, guard, env) {
  const binary = process.env.BENCHMARK_BINARY
    ? resolve(process.env.BENCHMARK_BINARY)
    : undefined;
  return {
    executable: binary ?? process.execPath,
    args: binary ? [] : ['--require', guard, entry],
    env: {
      ...env,
      BENCHMARK_REPORT_RUNTIME: '1',
      // SEA consumes Node flags through NODE_OPTIONS, not CLI arguments.
      ...(binary ? { NODE_OPTIONS: `--require ${JSON.stringify(guard)}` } : {}),
    },
    binary,
  };
}

export function readBenchmarkRuntime(stderr, binary) {
  const match = stderr.match(/^BENCHMARK_RUNTIME=(.+)$/m);
  assert(match, 'Runtime preload did not execute');
  const runtime = JSON.parse(match[1]);
  assert.equal(runtime.sea, Boolean(binary), 'Unexpected benchmark runtime');
  return runtime;
}
