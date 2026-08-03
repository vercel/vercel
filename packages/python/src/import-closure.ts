import { join } from 'path';
import { debug } from '@vercel/build-utils';
import type { ImportClosureOptions } from '@vercel/python-analysis';
import {
  generatedPythonPathToModule,
  getGeneratedQueueHandlerPath,
  getSubscriberOutputPath,
  type Subscriber,
  type SubscriberDeclaration,
} from './subscribers';
import { getWorkflowOutputPath, type PyprojectWorkflow } from './workflows';
import type { WorkflowServingMode } from './sdk-detection';

const RUNTIME_BOOTSTRAP_MODULE = 'vercel_runtime.vc_init';

/** Converts a stalled import closure into a skipped ranking input. */
export const IMPORT_CLOSURE_TIMEOUT_MS = 30_000;

/** Resolve to undefined when `promise` exceeds `ms`. Never rejects on time. */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<undefined>(resolvePromise => {
    timer = setTimeout(() => {
      debug(`${label} timed out after ${ms}ms`);
      resolvePromise(undefined);
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function getImportClosureOptions({
  workPath,
  entrypoint,
  frameworkSeeds,
  extraPythonPath,
  subscriberDeclarations,
  subscribers,
  workflows,
  workflowMode,
  sitePackageDirs,
}: {
  workPath: string;
  entrypoint?: string;
  frameworkSeeds: string[];
  extraPythonPath?: string;
  subscriberDeclarations: Pick<SubscriberDeclaration, 'moduleName'>[];
  subscribers: Pick<Subscriber, 'name'>[];
  workflows: Pick<PyprojectWorkflow, 'name' | 'moduleName'>[];
  workflowMode: WorkflowServingMode;
  sitePackageDirs: string[];
}): ImportClosureOptions {
  const workerModules = [
    ...subscriberDeclarations.map(declaration => declaration.moduleName),
    ...workflows.map(workflow => workflow.moduleName),
  ];
  const generatedWorkerModules = [
    ...subscribers.map(subscriber =>
      generatedPythonPathToModule(
        getGeneratedQueueHandlerPath(getSubscriberOutputPath(subscriber.name))
      )
    ),
    ...(workflowMode === 'queue'
      ? workflows.map(workflow =>
          generatedPythonPathToModule(
            getGeneratedQueueHandlerPath(getWorkflowOutputPath(workflow.name))
          )
        )
      : []),
  ];

  return {
    seeds: [
      ...new Set([
        RUNTIME_BOOTSTRAP_MODULE,
        ...(entrypoint ? [join(workPath, entrypoint)] : []),
        ...frameworkSeeds,
        ...workerModules,
        ...generatedWorkerModules,
      ]),
    ],
    searchRoots: [
      ...new Set([
        ...(extraPythonPath ? [extraPythonPath] : []),
        workPath,
        ...sitePackageDirs,
      ]),
    ],
  };
}
