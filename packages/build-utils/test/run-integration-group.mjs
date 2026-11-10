import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const group = process.argv[2];
if (!/^[1-4]$/.test(group)) {
  console.error('Expected an integration test group from 1 through 4.');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const vitestPackagePath = require.resolve('vitest/package.json');
const vitestPackage = require(vitestPackagePath);
const vitestBin = path.resolve(
  path.dirname(vitestPackagePath),
  vitestPackage.bin.vitest
);

const child = spawn(
  process.execPath,
  [
    vitestBin,
    'run',
    '--config',
    '../../vitest.config.mts',
    'test/integration.test.ts',
  ],
  {
    env: { ...process.env, BUILD_UTILS_E2E_GROUP: group },
    stdio: 'inherit',
  }
);

child.on('error', error => {
  console.error(error);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
