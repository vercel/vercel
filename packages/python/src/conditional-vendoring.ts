import { normalizePackageName, parsePep508 } from '@vercel/python-analysis';
import type { PythonPackage } from '@vercel/python-analysis';

type InjectedPackageName =
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
   * Optional function within {@link module} that queue-serving processes
   * call after {@link installer} to activate consumption (register push
   * callbacks, start the adapter's embedded worker). Never called from
   * publish-only processes.
   */
  servingActivator?: string;
}

/**
 * Queue adapter integrations required by the project's direct
 * dependencies. Activation is keyed on the upstream dependency (celery,
 * dramatiq, …) being declared by the project — the integration package
 * itself may be conditionally injected or declared directly. Failing to
 * import or install a required integration is a hard error for the
 * callers emitting activation code.
 */
export async function getQueueIntegrations({
  pythonPackage,
}: {
  pythonPackage: PythonPackage | undefined;
}): Promise<QueueIntegration[]> {
  const dependencies = await getDirectDependencyNames(pythonPackage);
  if (!dependencies) return [];
  const integrations: QueueIntegration[] = [];
  for (const [upstream, adapter] of UPSTREAM_DEPENDENCY_ADAPTERS) {
    if (dependencies.has(upstream)) {
      integrations.push(adapter.integration);
    }
  }
  return integrations;
}

const INJECTED_PACKAGE_NAMES = new Set<InjectedPackageName>([
  'vercel-celery',
  'vercel-celery-bundle',
  'vercel-dramatiq',
  'vercel-dramatiq-bundle',
]);

export interface ConditionalInjectedPackage {
  name: InjectedPackageName;
  requirement: string;
  envOverride: string | undefined;
  allowLocalSource: boolean;
}

export async function getConditionalInjectedPackages({
  pythonPackage,
  env,
}: {
  pythonPackage: PythonPackage | undefined;
  env: NodeJS.ProcessEnv;
}): Promise<ConditionalInjectedPackage[]> {
  const dependencies = await getDirectDependencyNames(pythonPackage);
  if (!dependencies) return [];

  const injectedPackages: ConditionalInjectedPackage[] = [];
  for (const [upstream, adapter] of UPSTREAM_DEPENDENCY_ADAPTERS) {
    if (!dependencies.has(upstream)) continue;
    if (hasDirectInjectedPackage(dependencies)) {
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

  return injectedPackages;
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

function hasDirectInjectedPackage(dependencies: Set<string>): boolean {
  for (const packageName of INJECTED_PACKAGE_NAMES) {
    if (dependencies.has(packageName)) return true;
  }
  return false;
}
