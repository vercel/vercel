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
 * (see `@vercel/fs-detectors` service resolution).
 */
export const WORKFLOW_TOPIC_PATTERN = '__wkf_*';

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
  // Every workflow consumer receives every `__wkf_*` message, so a second
  // Lambda would fail on runs registered only in the first. All workflows
  // must be importable from a single entrypoint module.
  if (workflows.length > 1) {
    throw workflowError(
      '"tool.vercel.workflows" must declare a single entrypoint that registers every workflow'
    );
  }

  return Promise.all(
    workflows.map((config, index) => parseWorkflow(workPath, index, config))
  );
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
