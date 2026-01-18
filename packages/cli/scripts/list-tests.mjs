#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliRoot = join(__dirname, '..');

// Filter out --listTests from arguments since vitest uses 'list' subcommand instead
const args = process.argv.slice(2).filter(arg => arg !== '--listTests' && arg !== '--');

// Run vitest list with --filesOnly to output just file paths (like jest --listTests)
const child = spawn(
  'npx',
  ['vitest', 'list', '--filesOnly', '--config', './vitest.config.mts', ...args],
  {
    cwd: cliRoot,
    stdio: ['inherit', 'pipe', 'inherit'],
    shell: true,
  }
);

// Convert relative paths to absolute paths for CI compatibility
child.stdout.on('data', data => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      // Output absolute path
      console.log(resolve(cliRoot, line.trim()));
    }
  }
});

child.on('close', code => {
  process.exit(code || 0);
});
