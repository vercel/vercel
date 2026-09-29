/**
 * TypeScript runner for generated portable scenarios. It consumes only the
 * generated JSON (see RUNNER-CONTRACT.md) and runs the built CLI through the
 * hermetic harness.
 */
import { describeRun, withScenario } from '../../harness/run-cli';
import type { Scenario } from '../model/schemas';
import { compareScenario } from './compare';
import { loadFaultsCatalog, loadOperationsCatalog } from './load';
import { materializeLocal } from './materialize';
import { readBackLocal } from './readback';
import { registerWorldApi, type WorldApiCatalog } from './world-api';

interface CapabilityOptions {
  env?: Record<string, string>;
  routeProductionOrigins?: boolean;
}

/** How this runner implements each capability (runner-specific). */
const CAPABILITIES: Record<string, CapabilityOptions> = {
  'app-principal': { env: { APP_PRINCIPAL_ENABLED: '1' } },
  'production-origin-routing': { routeProductionOrigins: true },
};

export type ScenarioRunResult =
  | { status: 'skipped'; reason: string }
  | { status: 'ran'; failures: string[]; diagnostics: string };

let cachedCatalog: WorldApiCatalog | undefined;

function catalog(): WorldApiCatalog {
  cachedCatalog ??= {
    operations: loadOperationsCatalog(),
    faults: loadFaultsCatalog(),
  };
  return cachedCatalog;
}

export async function runScenario(
  scenario: Scenario
): Promise<ScenarioRunResult> {
  const missing = scenario.requires.filter(
    id => !Object.prototype.hasOwnProperty.call(CAPABILITIES, id)
  );
  if (missing.length > 0) {
    return {
      status: 'skipped',
      reason: `runner lacks capabilities: ${missing.join(', ')}`,
    };
  }

  const { operations } = catalog();
  const identityOperations = new Set(
    Object.entries(operations.operations)
      .filter(([, operation]) => operation.identity)
      .map(([id]) => id)
  );

  let outcome: ScenarioRunResult | undefined;
  await withScenario(async ({ api, sandbox, run }) => {
    materializeLocal(sandbox, scenario.world.local);
    const worldApi = registerWorldApi(
      api,
      scenario.world,
      scenario.conditions,
      catalog()
    );
    const capabilities = scenario.requires.map(id => CAPABILITIES[id]);
    const env = Object.assign({}, ...capabilities.map(c => c?.env ?? {}));

    const result = await run({
      args: scenario.invoke.argv,
      ...(scenario.invoke.token === null
        ? {}
        : { token: scenario.invoke.token }),
      routeProductionOrigins: capabilities.some(
        c => c?.routeProductionOrigins === true
      ),
      env,
    });
    const readBack = readBackLocal(sandbox);

    const failures = compareScenario(
      scenario,
      {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        calls: worldApi.calls,
        world: { server: worldApi.server, local: readBack.local },
        readBackProblems: readBack.problems,
      },
      identityOperations
    );
    // TS-runner invariants beyond the portable contract.
    if (result.signal !== null) failures.push(`signal: ${result.signal}`);
    if (result.guardViolations.length > 0) {
      failures.push(
        `guard violations: ${JSON.stringify(result.guardViolations)}`
      );
    }
    if (api.unhandled.length > 0) {
      failures.push(
        `unhandled requests: ${api.unhandled.map(({ method, path }) => `${method} ${path}`).join(', ')}`
      );
    }

    outcome = {
      status: 'ran',
      failures,
      diagnostics: describeRun(result, api),
    };
  });

  if (!outcome) throw new Error(`Scenario ${scenario.id} did not run`);
  return outcome;
}
