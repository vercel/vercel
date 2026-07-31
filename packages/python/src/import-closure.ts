import { join } from 'path';
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
