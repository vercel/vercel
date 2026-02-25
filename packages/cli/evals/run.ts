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
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

// run.ts is in packages/cli/evals/, so evals fixtures are in packages/cli/evals/evals/
const EVALS_DIR = join(__dirname, 'evals');

const populateOIDCToken = async () => {
  const pullArgs = ['env', 'pull', '-y'];
  const pullChild = spawn('vc', pullArgs, {
    cwd: join(__dirname, 'sandbox-project'),
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  const pullExitCode = await new Promise<number>(resolve => {
    pullChild.on('close', (code, signal) => {
      resolve(code ?? (signal ? 1 : 0));
    });
  });

  if (pullExitCode !== 0) {
    process.exit(pullExitCode);
  }

  config({ path: join(__dirname, 'sandbox-project', '.env.local') });
};

/** Recursively discover eval dirs (have PROMPT.md + EVAL.ts + package.json). Returns relative paths e.g. "build", "env/ls", "env/add". */
function discoverEvals(): string[] {
  if (!existsSync(EVALS_DIR)) return [];
  const results: string[] = [];

  function walk(dir: string, prefix: string): void {
    const hasPrompt = existsSync(join(dir, 'PROMPT.md'));
    const hasEval = existsSync(join(dir, 'EVAL.ts'));
    const hasPkg = existsSync(join(dir, 'package.json'));
    if (hasPrompt && hasEval && hasPkg) {
      results.push(prefix);
      return;
    }
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.')) {
        walk(join(dir, e.name), prefix ? `${prefix}/${e.name}` : e.name);
      }
    }
  }

  const topEntries = readdirSync(EVALS_DIR, { withFileTypes: true });
  for (const e of topEntries) {
    if (e.isDirectory() && !e.name.startsWith('.')) {
      walk(join(EVALS_DIR, e.name), e.name);
    }
  }
  return results;
}

async function main() {
  const evals = discoverEvals();
  if (evals.length === 0) {
    process.stdout.write(
      'No evals to run (evals/ has no fixtures with PROMPT.md + EVAL.ts + package.json).\n'
    );
    process.exit(0);
  }

  await populateOIDCToken();

  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry');
  const hasCreds = Boolean(process.env.VERCEL_OIDC_TOKEN);
  if (!isDryRun && !hasCreds) {
    process.stderr.write(
      'Evals require AI_GATEWAY_API_KEY (e.g. from Vercel → AI Gateway → API Keys). Set it in .env or CI secrets (or use --dry to preview).\n'
    );
    process.exit(1);
  }

  // Progress: print what will run so it's visible as the eval runs
  process.stdout.write(`\nEvals to run: ${evals.join(', ')}\n`);
  process.stdout.write(
    'Progress: each eval prints "Running <name>..." when it starts and "✓/✗ <name>..." when it finishes (can take several minutes per eval).\n\n'
  );

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
