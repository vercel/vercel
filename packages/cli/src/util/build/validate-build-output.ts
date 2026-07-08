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
 * Validate a Build Output API `config.json` (top-level or per-service),
 * appending any problems found. The `label` prefixes each message so callers
 * can distinguish the top-level config from a service's config.
 */
async function validateOutputConfig(
  configPath: string,
  label: string,
  problems: BuildOutputProblem[]
): Promise<void> {
  const configExists = await fs.pathExists(configPath);

  if (!configExists) {
    problems.push({
      severity: 'error',
      message: `${label} is missing config.json.`,
    });
    return;
  }

  let config: { version?: unknown } | undefined;
  try {
    config = await fs.readJSON(configPath);
  } catch (err) {
    problems.push({
      severity: 'error',
      message: `${label} config.json is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }.`,
    });
    return;
  }

  if (config && config.version !== 3) {
    problems.push({
      severity: 'warning',
      message: `${label} config.json has unexpected version "${config.version}" (expected 3).`,
    });
  }
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
    await validateOutputConfig(
      join(outputDir, 'config.json'),
      'Build output',
      problems
    );

    // Builds may emit a `services/<name>/` layout, where each service is a
    // nested Build Output API root. A missing `services` dir is the normal
    // (non-services) case; rethrow anything other than ENOENT so the outer
    // catch produces the single-error fallback.
    const servicesDir = join(outputDir, 'services');
    let serviceNames: string[] = [];
    try {
      const entries = await fs.readdir(servicesDir, { withFileTypes: true });
      serviceNames = entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw err;
      }
    }

    const [hasFunctions, hasStatic] = await Promise.all([
      fs.pathExists(join(outputDir, 'functions')),
      fs.pathExists(join(outputDir, 'static')),
    ]);
    const hasServices = serviceNames.length > 0;

    if (!hasFunctions && !hasStatic && !hasServices) {
      problems.push({
        severity: 'warning',
        message:
          'Build output contains no "functions", "static", or "services" directory; the build may not have produced any deployable output.',
      });
    }

    for (const name of serviceNames) {
      const serviceDir = join(servicesDir, name);
      const label = `Build output service "${name}"`;

      await validateOutputConfig(
        join(serviceDir, 'config.json'),
        label,
        problems
      );

      const [svcHasFunctions, svcHasStatic] = await Promise.all([
        fs.pathExists(join(serviceDir, 'functions')),
        fs.pathExists(join(serviceDir, 'static')),
      ]);
      if (!svcHasFunctions && !svcHasStatic) {
        problems.push({
          severity: 'warning',
          message: `${label} contains no "functions" or "static" directory; the service may not have produced any deployable output.`,
        });
      }
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
