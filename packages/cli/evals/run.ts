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
import { destroy, getProjectModeVariantsFromEnv, setup } from './hooks';
import type { EvalRunContext, EvalVariant, SetupResult } from './hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));

// run.ts is in packages/cli/evals/, so evals fixtures are in packages/cli/evals/evals/
const EVALS_DIR = join(__dirname, 'evals');

const populateOIDCToken = async () => {
  const pullArgs = ['env', 'pull', '-y'];

  const runPull = (cmd: string) =>
    new Promise<number>((resolve, reject) => {
      const child = spawn(cmd, pullArgs, {
        cwd: join(__dirname, 'sandbox-project'),
        stdio: 'inherit',
        env: { ...process.env, FORCE_COLOR: '1' },
      });

      child.on('error', err => {
        reject(
          new Error(
            `Failed to start "${cmd} env pull -y": ${
              (err as Error).message || String(err)
            }`
          )
        );
      });

      child.on('close', (code, signal) => {
        resolve(code ?? (signal ? 1 : 0));
      });
    });

  let lastError: Error | undefined;

  for (const cmd of ['vc', 'vercel']) {
    try {
      const pullExitCode = await runPull(cmd);
      if (pullExitCode === 0) {
        config({ path: join(__dirname, 'sandbox-project', '.env.local') });
        return;
      }
      lastError = new Error(
        `"${cmd} env pull -y" exited with code ${pullExitCode}`
      );
    } catch (err: any) {
      lastError =
        err instanceof Error
          ? err
          : new Error(typeof err === 'string' ? err : String(err));
    }
  }

  // Smoke uses the Vercel sandbox and requires OIDC. Only fall back to VERCEL_TOKEN
  // when smoke is not explicitly requested (e.g. not running `pnpm test:evals smoke`).
  const args = process.argv.slice(2);
  const runningSmoke = args.includes('smoke');
  if (process.env.VERCEL_TOKEN && !runningSmoke) {
    const message = lastError
      ? lastError.message
      : 'unknown error running "vc/vercel env pull -y"';
    process.stderr.write(
      `Warning: could not populate OIDC token via "vc/vercel env pull -y" (${message}). Continuing with VERCEL_TOKEN.\n`
    );
    return;
  }

  throw lastError
    ? new Error(
        `Failed to populate OIDC token via "vc/vercel env pull -y": ${lastError.message}`
      )
    : new Error('Failed to populate OIDC token via "vc/vercel env pull -y".');
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

  const sandboxProjectDir = join(__dirname, 'sandbox-project');
  const variants: EvalVariant[] = getProjectModeVariantsFromEnv('auto');

  try {
    await populateOIDCToken();
  } catch (err: any) {
    const message =
      err && typeof err.message === 'string'
        ? err.message
        : String(err ?? 'unknown error');
    process.stderr.write(`Error populating OIDC token: ${message}\n`);
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry');
  const hasCreds = Boolean(
    process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL_TOKEN
  );
  if (!isDryRun && !hasCreds) {
    process.stderr.write(
      'Evals require AI_GATEWAY_API_KEY and either VERCEL_OIDC_TOKEN or VERCEL_TOKEN (set in .env or CI secrets, or use --dry to preview).\n'
    );
    process.exit(1);
  }

  // When OIDC wasn't available we fell back to VERCEL_TOKEN; smoke uses the Vercel sandbox and requires OIDC, so skip it.
  const usedOIDCFallback =
    !process.env.VERCEL_OIDC_TOKEN && Boolean(process.env.VERCEL_TOKEN);
  const flagArgs = args.filter(a => a.startsWith('-'));
  const explicitExperimentArgs = args.filter(a => !a.startsWith('-'));
  const experimentsToRun =
    explicitExperimentArgs.length > 0
      ? explicitExperimentArgs
      : usedOIDCFallback
        ? ['cc', 'cli', 'vercel-cli-cc']
        : [];
  const agentEvalArgsToPass =
    experimentsToRun.length > 0 ? [...flagArgs, ...experimentsToRun] : args;
  if (usedOIDCFallback && explicitExperimentArgs.length === 0) {
    process.stderr.write(
      'Skipping smoke experiment (requires OIDC). Running: cc, cli, vercel-cli-cc.\n'
    );
  }

  // Progress: print what will run so it's visible as the eval runs
  process.stdout.write(`\nEvals to run: ${evals.join(', ')}\n`);
  process.stdout.write(
    'Progress: each eval prints "Running <name>..." when it starts and "✓/✗ <name>..." when it finishes (can take several minutes per eval).\n\n'
  );

  let overallExitCode = 0;

  for (const variant of variants) {
    const context: EvalRunContext = {
      cwd: __dirname,
      sandboxProjectDir,
      projectMode: variant.projectMode,
    };

    let setupResult: SetupResult | void;

    process.stdout.write(
      `\n=== CLI eval variant "${variant.id}" (projectMode=${variant.projectMode}) ===\n`
    );

    try {
      setupResult = await setup(context);

      const agentEvalEnv = { ...process.env, FORCE_COLOR: '1' };
      if (setupResult?.createdProjectId) {
        agentEvalEnv.CLI_EVAL_PROJECT_ID = setupResult.createdProjectId;
      }

      const agentEvalArgs = [
        '--yes',
        '@vercel/agent-eval@latest',
        ...agentEvalArgsToPass,
      ];

      const child = spawn('npx', agentEvalArgs, {
        cwd: __dirname,
        stdio: 'inherit',
        env: agentEvalEnv,
      });

      const exitCode = await new Promise<number>(resolve => {
        child.on('close', (code, signal) => {
          resolve(code ?? (signal ? 1 : 0));
        });
      });

      if (exitCode !== 0) {
        overallExitCode = exitCode;
      }
    } catch (err: any) {
      const message =
        err && typeof err.message === 'string'
          ? err.message
          : String(err ?? 'unknown error');
      process.stderr.write(
        `Error running CLI eval variant "${variant.id}": ${message}\n`
      );
      overallExitCode = 1;
    } finally {
      try {
        await destroy(context, setupResult);
      } catch (err: any) {
        const message =
          err && typeof err.message === 'string'
            ? err.message
            : String(err ?? 'unknown error');
        process.stderr.write(
          `Error during CLI evals teardown (destroy hook) for variant "${variant.id}": ${message}\n`
        );
      }
    }
  }

  process.exit(overallExitCode);
}

main().catch(err => {
  process.stderr.write(`Error running evals: ${err}\n`);
  process.exit(1);
});
