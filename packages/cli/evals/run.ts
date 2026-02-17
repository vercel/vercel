#!/usr/bin/env tsx
/**
 * Runner for Vercel CLI evals. Discovers evals in evals/, then:
 * - If no evals found → exit 0 (success).
 * - If evals found → run @vercel/agent-eval with the same args.
 * Usage: pnpm test [experiment] [--dry]
 */

import { spawn } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EVALS_DIR = join(__dirname, 'evals');

function discoverEvals(): string[] {
  if (!existsSync(EVALS_DIR)) return [];
  const entries = readdirSync(EVALS_DIR, { withFileTypes: true });
  const dirs = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .filter(d => {
      const p = join(EVALS_DIR, d.name);
      return (
        existsSync(join(p, 'PROMPT.md')) &&
        existsSync(join(p, 'EVAL.ts')) &&
        existsSync(join(p, 'package.json'))
      );
    })
    .map(d => d.name);
  return dirs;
}

async function main() {
  const evals = discoverEvals();
  if (evals.length === 0) {
    process.stdout.write(
      'No evals to run (evals/ has no fixtures with PROMPT.md + EVAL.ts + package.json).\n'
    );
    process.exit(0);
  }

  const args = process.argv.slice(2);
  const agentEvalArgs = ['--yes', '@vercel/agent-eval@latest', ...args];

  const child = spawn('npx', agentEvalArgs, {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  const exitCode = await new Promise<number>(resolve => {
    child.on('close', (code, signal) => {
      resolve(code ?? (signal ? 1 : 0));
    });
  });

  process.exit(exitCode);
}

main().catch(err => {
  process.stderr.write(`Error running evals: ${err}\n`);
  process.exit(1);
});
