import { normalizePackageName, parsePep508 } from '@vercel/python-analysis';
import type { PythonPackage } from '@vercel/python-analysis';

type InjectedPackageName =
  | 'vercel-apscheduler'
  | 'vercel-apscheduler-bundle'
  | 'vercel-celery'
  | 'vercel-celery-bundle'
  | 'vercel-dramatiq'
  | 'vercel-dramatiq-bundle';

const UPSTREAM_DEPENDENCY_ADAPTERS = new Map<
  string,
  {
    bundled: InjectedPackageName;
    unbundled: InjectedPackageName;
    envOverride: string;
    preferUnbundledWhenPresent: string[];
    integration: QueueIntegration;
  }
>([
  [
    'apscheduler',
    {
      bundled: 'vercel-apscheduler-bundle',
      unbundled: 'vercel-apscheduler',
      envOverride: 'VERCEL_PYTHON_APSCHEDULER_DEPENDENCY',
      preferUnbundledWhenPresent: ['vercel-queue'],
      integration: {
        module: 'vercel.integrations.apscheduler',
        installer: 'install_vercel_apscheduler_integration',
        // APScheduler jobs are declared while the subscriber module imports.
        // Install first so the adapter can capture those definitions.
        installBeforeImport: true,
        subscriberProbe: 'is_scheduler_subscriber',
      },
    },
  ],
  [
    'celery',
    {
      bundled: 'vercel-celery-bundle',
      unbundled: 'vercel-celery',
      envOverride: 'VERCEL_PYTHON_CELERY_DEPENDENCY',
      preferUnbundledWhenPresent: ['vercel-queue'],
      integration: {
        module: 'vercel.integrations.celery',
        installer: 'install_vercel_celery_integration',
      },
    },
  ],
  [
    'dramatiq',
    {
      bundled: 'vercel-dramatiq-bundle',
      unbundled: 'vercel-dramatiq',
      envOverride: 'VERCEL_PYTHON_DRAMATIQ_DEPENDENCY',
      preferUnbundledWhenPresent: ['vercel-queue'],
      integration: {
        module: 'vercel.integrations.dramatiq',
        installer: 'install_vercel_dramatiq_integration',
        // The installer only wires the broker; queue-serving processes
        // must also register push callbacks and start the embedded
        // worker, or deliveries hand off to nobody and retry forever.
        servingActivator: 'register_dramatiq_queues',
      },
    },
  ],
]);

/**
 * A Vercel queue adapter integration that must be activated (imported and
 * installed) before a subscriber module can register its subscriptions.
 */
export interface QueueIntegration {
  /** Python module that provides the integration. */
  module: string;
  /** Name of the integration's install function within {@link module}. */
  installer: string;
  /**
   * Install before importing the subscriber module. Frameworks whose
   * declarations are created during import use this to observe construction
   * rather than trying to reconstruct it afterward.
   */
  installBeforeImport?: boolean;
  /**
   * Optional function within {@link module} that reports whether a declared
   * subscriber object belongs to this integration, given
   * (module_name, variable_name). Build-time introspection calls it so
   * classification stays in the integration instead of leaking wire details
   * such as internal topic names.
   */
  subscriberProbe?: string;
  /**
   * Optional function within {@link module} that queue-serving processes
   * call after {@link installer} to activate consumption (register push
   * callbacks, start the adapter's embedded worker). Never called from
   * publish-only processes.
   */
  servingActivator?: string;
}

export interface QueueAdapterInjectedPackage {
  name: InjectedPackageName;
  requirement: string;
  envOverride: string | undefined;
  allowLocalSource: boolean;
}

export interface QueueAdapterBootstrap {
  /**
   * Integrations to activate around importing subscriber modules, keyed on
   * the upstream dependency (APScheduler, Celery, Dramatiq, …). The
   * adapter package may be injected or self-declared. Callers emitting
   * activation code treat a failed import or install as a hard error.
   */
  integrations: QueueIntegration[];
  /** Adapter packages to install when the project does not declare them itself. */
  injectedPackages: QueueAdapterInjectedPackage[];
}

/**
 * The queue adapter bootstrap (package injection plus integration
 * activation) required by the project's dependencies. Owns the
 * applicability policy:
 *
 * - Only projects declaring `[[tool.vercel.subscribers]]` bootstrap
 *   adapters: without a subscriber nothing serves the queues, and keying
 *   on the upstream dependency alone would couple every project using the
 *   framework to the adapter packages. hasDeclaredSubscribers is presence
 *   in the project pyproject.toml (hasPyprojectSubscribers), not this
 *   build's composed subscribers, so web service builds that only publish
 *   still bootstrap.
 * - Legacy vercel-workers projects are excluded: their runtime brings its
 *   own adapter integration, and a second transport would compete with it.
 */
export async function getQueueAdapterBootstrap({
  pythonPackage,
  env,
  legacyWorkersProject,
  hasDeclaredSubscribers,
}: {
  pythonPackage: PythonPackage | undefined;
  env: NodeJS.ProcessEnv;
  legacyWorkersProject: boolean;
  hasDeclaredSubscribers: boolean;
}): Promise<QueueAdapterBootstrap> {
  const integrations: QueueIntegration[] = [];
  const injectedPackages: QueueAdapterInjectedPackage[] = [];
  const bootstrap = { integrations, injectedPackages };
  if (legacyWorkersProject || !hasDeclaredSubscribers) {
    return bootstrap;
  }
  const dependencies = await getDirectDependencyNames(pythonPackage);
  if (!dependencies) {
    return bootstrap;
  }

  for (const [upstream, adapter] of UPSTREAM_DEPENDENCY_ADAPTERS) {
    if (!dependencies.has(upstream)) continue;
    integrations.push(adapter.integration);
    // Injection is narrower than activation: a self-declared adapter is
    // the user's to manage but must still be activated.
    if (
      dependencies.has(adapter.bundled) ||
      dependencies.has(adapter.unbundled)
    ) {
      continue;
    }

    const name = adapter.preferUnbundledWhenPresent.some(dep =>
      dependencies.has(dep)
    )
      ? adapter.unbundled
      : adapter.bundled;
    injectedPackages.push({
      name,
      requirement: name,
      envOverride: env[adapter.envOverride],
      allowLocalSource: false,
    });
  }

  return bootstrap;
}

async function getDirectDependencyNames(
  pythonPackage: PythonPackage | undefined
): Promise<Set<string> | undefined> {
  const dependencies = pythonPackage?.manifest?.data?.project?.dependencies;
  if (!Array.isArray(dependencies)) {
    return undefined;
  }

  const parsedDependencies = await parsePep508(dependencies);
  const dependencyNames = new Set(
    parsedDependencies
      .filter(dependency => dependency !== null)
      .map(dependency => normalizePackageName(dependency.name))
  );
  return dependencyNames;
}
