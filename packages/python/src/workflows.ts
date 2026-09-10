import { join } from 'path';
import fs from 'fs';
import {
  NowBuildError,
  readConfigFile,
  sanitizeConsumerName,
} from '@vercel/build-utils';
import {
  getModuleEntrypointName,
  parseModuleEntrypoint,
  resolveExistingEntrypoint,
  safePathSegment,
} from './module-entrypoint';

const WORKFLOW_OUTPUT_DIR = '_py_workflows';

/**
 * Workflow runs and steps are delivered on `__wkf_`-prefixed topics whose
 * names embed the workflow id, so a workflow consumer subscribes to the
 * wildcard pattern — the same one assigned to workflow-triggered job services
 * (see `@vercel/fs-detectors` service resolution). Queue-served workflows
 * attach their introspected topics instead, so this pattern only backs the
 * legacy vercel-workers serving mode.
 */
export const WORKFLOW_TOPIC_PATTERN = '__wkf_*';

/**
 * Dev sidecar placeholder covering namespaced workflow topics too; the dev
 * queue broker expands `*` anywhere in a pattern, and replaces these topics
 * with the SDK-registered subscriptions once the sidecar starts.
 */
export const WORKFLOW_DEV_TOPIC_PATTERN = '__*wkf_*';

/**
 * A `vercel.workflow.Workflows` registry subscribes on `__wkf_*` topics, or
 * `__{namespace}_wkf_*` when constructed with a namespace (lowercase
 * alphanumeric, per the SDK's validation). The namespace is only known to
 * the SDK, so workflow subscriptions are selected by topic shape rather
 * than a declared pattern.
 */
const WORKFLOW_QUEUE_TOPIC_RE = /^__(?:[a-z][a-z0-9]*_)?wkf_/;

export function isWorkflowQueueTopic(topic: string): boolean {
  return WORKFLOW_QUEUE_TOPIC_RE.test(topic);
}

export interface PyprojectWorkflow {
  name: string;
  entrypoint: string;
  moduleName: string;
  variableName: string;
}

interface RawWorkflow {
  entrypoint?: unknown;
}

const WORKFLOW_FIELD_NAMES = new Set(['entrypoint']);

interface Pyproject {
  tool?: {
    vercel?: {
      workflows?: RawWorkflow[];
    };
  };
}

export function getWorkflowOutputPath(workflowName: string): string {
  return `${WORKFLOW_OUTPUT_DIR}/${safePathSegment(workflowName)}`;
}

export function getWorkflowConsumerName(workflowName: string): string {
  return sanitizeConsumerName(getWorkflowOutputPath(workflowName));
}

export async function getPyprojectWorkflows(
  workPath: string
): Promise<PyprojectWorkflow[]> {
  const pyprojectPath = join(workPath, 'pyproject.toml');
  if (!fs.existsSync(pyprojectPath)) {
    return [];
  }

  const pyproject = await readConfigFile<Pyproject>(pyprojectPath);
  const workflows = pyproject?.tool?.vercel?.workflows;
  if (!workflows) {
    return [];
  }
  if (!Array.isArray(workflows)) {
    throw workflowError('"tool.vercel.workflows" must be an array');
  }
  const parsedWorkflows = await Promise.all(
    workflows.map((config, index) => parseWorkflow(workPath, index, config))
  );

  const seenNames = new Set<string>();
  for (const workflow of parsedWorkflows) {
    if (seenNames.has(workflow.name)) {
      throw workflowError(
        `workflow "${workflow.name}" is declared more than once`
      );
    }
    seenNames.add(workflow.name);
  }

  return parsedWorkflows;
}

async function parseWorkflow(
  workPath: string,
  index: number,
  config: RawWorkflow
): Promise<PyprojectWorkflow> {
  const label = `workflow #${index + 1}`;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw workflowError(`${label} must be an object`);
  }

  for (const key of Object.keys(config)) {
    if (!WORKFLOW_FIELD_NAMES.has(key)) {
      throw workflowError(`${label} has unrecognized field "${key}"`);
    }
  }

  if (typeof config.entrypoint !== 'string') {
    throw workflowError(`${label} must define string field "entrypoint"`);
  }

  const entrypoint = parseModuleEntrypoint(config.entrypoint);
  if (!entrypoint) {
    throw workflowError(
      `${label} has invalid entrypoint "${config.entrypoint}". Use "module:object"`
    );
  }

  const name = getModuleEntrypointName(entrypoint);
  const existingEntrypoint = await resolveExistingEntrypoint(
    workPath,
    entrypoint.filePath
  );
  if (!existingEntrypoint) {
    throw workflowError(
      `workflow "${name}" has entrypoint "${config.entrypoint}" but file "${entrypoint.filePath}" does not exist`
    );
  }

  return {
    name,
    entrypoint: existingEntrypoint,
    moduleName: entrypoint.moduleName,
    variableName: entrypoint.variableName,
  };
}

function workflowError(message: string): NowBuildError {
  return new NowBuildError({
    code: 'PYTHON_INVALID_WORKFLOW_CONFIG',
    message,
  });
}
