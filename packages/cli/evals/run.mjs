#!/usr/bin/env node
/**
 * Run CLI evals from packages/cli/evals.
 * Forwards args to @vercel/agent-eval (e.g. --dry, experiment name).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evalsDir = __dirname;
const defaultExperiment = 'cli-default';

const args = process.argv.slice(2);
const hasExperiment = args.length > 0 && !args[0].startsWith('-');
const experiment = hasExperiment ? args[0] : defaultExperiment;
const rest = hasExperiment ? args.slice(1) : args;

const result = spawnSync('npx', ['@vercel/agent-eval', experiment, ...rest], {
  cwd: evalsDir,
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
