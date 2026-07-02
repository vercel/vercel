import fs from 'fs-extra';
import { join } from 'path';
import { debug as builderDebug } from '@vercel/build-utils';
import output from '../../output-manager';

/**
 * Emit a debug log to both the CLI output manager (visible with `--debug`)
 * and the build-utils debug channel (visible with `VERCEL_BUILDER_DEBUG=1`).
 */
function logDebug(message: string): void {
  output.debug(message);
  builderDebug(message);
}

export interface BuildOutputProblem {
  severity: 'warning' | 'error';
  message: string;
}

/**
 * Validate the contents of a Build Output API directory (`.vercel/output`),
 * returning a list of problems. Never throws.
 */
export async function validateBuildOutput(
  outputDir: string
): Promise<BuildOutputProblem[]> {
  const problems: BuildOutputProblem[] = [];

  logDebug(`Validating build output at "${outputDir}"`);

  try {
    const configPath = join(outputDir, 'config.json');
    const configExists = await fs.pathExists(configPath);

    if (!configExists) {
      problems.push({
        severity: 'error',
        message: 'Build output is missing config.json.',
      });
    } else {
      let config: { version?: unknown } | undefined;
      try {
        config = await fs.readJSON(configPath);
      } catch (err) {
        problems.push({
          severity: 'error',
          message: `Build output config.json is not valid JSON: ${
            err instanceof Error ? err.message : String(err)
          }.`,
        });
      }

      if (config && config.version !== 3) {
        problems.push({
          severity: 'warning',
          message: `Build output config.json has unexpected version "${config.version}" (expected 3).`,
        });
      }
    }

    const [hasFunctions, hasStatic] = await Promise.all([
      fs.pathExists(join(outputDir, 'functions')),
      fs.pathExists(join(outputDir, 'static')),
    ]);

    if (!hasFunctions && !hasStatic) {
      problems.push({
        severity: 'warning',
        message:
          'Build output contains no "functions" or "static" directory; the build may not have produced any deployable output.',
      });
    }

    logDebug(
      `Build output validation found ${problems.length} problem(s)` +
        (problems.length
          ? `: ${problems.map(p => `${p.severity}: ${p.message}`).join('; ')}`
          : '')
    );

    return problems;
  } catch (err) {
    return [
      {
        severity: 'error',
        message: `Unexpected error while validating build output: ${
          err instanceof Error ? err.message : String(err)
        }.`,
      },
    ];
  }
}

/**
 * Report a list of build output problems to the output manager.
 */
export function reportBuildOutputProblems(
  problems: BuildOutputProblem[]
): void {
  for (const problem of problems) {
    if (problem.severity === 'error') {
      output.error(problem.message);
    } else {
      output.warn(problem.message);
    }
  }
}
