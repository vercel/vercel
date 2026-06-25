import fs from 'fs';
import { join } from 'path';
import { NowBuildError, readConfigFile } from '@vercel/build-utils';
import {
  parseModuleEntrypoint,
  resolveEntrypointFile,
} from './module-entrypoint';

export const PYTHON_WORKFLOW_OUTPUT_PATH = '.well-known/workflow/v1/flow';
export const PYTHON_WORKFLOW_TOPIC = '__wkf_*';
export const PYTHON_WORKFLOW_ENTRYPOINT = 'vc__workflow__python.py';
export const PYTHON_WORKFLOW_MODULE_NAME = 'vc__workflow__python';

const WORKFLOW_NAME_RE = /^[A-Za-z]([A-Za-z0-9_-]*[A-Za-z0-9])?$/;
const WORKFLOW_FIELD_NAMES = new Set(['entrypoint']);

export interface WorkflowConfig {
  name: string;
  entrypoint: string;
  moduleName: string;
  variableName: string;
}

interface RawWorkflowConfig {
  entrypoint?: unknown;
}

interface Pyproject {
  tool?: {
    vercel?: {
      workflows?: Record<string, RawWorkflowConfig>;
    };
  };
}

export async function getPyprojectWorkflows(
  workPath: string
): Promise<WorkflowConfig[]> {
  const pyprojectPath = join(workPath, 'pyproject.toml');
  if (!fs.existsSync(pyprojectPath)) {
    return [];
  }

  const pyproject = await readConfigFile<Pyproject>(pyprojectPath);
  const workflows = pyproject?.tool?.vercel?.workflows;
  if (workflows === undefined) {
    return [];
  }
  if (!workflows || typeof workflows !== 'object' || Array.isArray(workflows)) {
    throw workflowError('"tool.vercel.workflows" must be an object');
  }
  if (typeof workflows.entrypoint === 'string') {
    throw workflowError(
      '"tool.vercel.workflows" must contain named workflow tables, for example [tool.vercel.workflows.my_workflow]'
    );
  }

  const entries = Object.entries(workflows).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  if (entries.length === 0) {
    throw workflowError(
      '"tool.vercel.workflows" must define at least one named workflow'
    );
  }

  const parsed: WorkflowConfig[] = [];
  const entrypointOwners = new Map<string, string>();
  for (const [name, config] of entries) {
    const workflow = await parseWorkflow(workPath, name, config);
    const entrypointKey = `${workflow.moduleName}:${workflow.variableName}`;
    const existingOwner = entrypointOwners.get(entrypointKey);
    if (existingOwner) {
      throw workflowError(
        `workflows "${existingOwner}" and "${name}" use the same entrypoint "${workflow.moduleName}:${workflow.variableName}"`
      );
    }
    entrypointOwners.set(entrypointKey, name);
    parsed.push(workflow);
  }

  return parsed;
}

export function createWorkflowAggregator(workflows: WorkflowConfig[]): string {
  const entrypoints = workflows
    .map(
      workflow =>
        `    (${JSON.stringify(workflow.name)}, ${JSON.stringify(workflow.moduleName)}, ${JSON.stringify(workflow.variableName)}),`
    )
    .join('\n');

  return `
import importlib as _vc_importlib

_vc_workflow_entrypoints = (
${entrypoints}
)

for _vc_name, _vc_module_name, _vc_variable_name in _vc_workflow_entrypoints:
    _vc_module = _vc_importlib.import_module(_vc_module_name)
    try:
        getattr(_vc_module, _vc_variable_name)
    except AttributeError as _vc_error:
        raise RuntimeError(
            f'Workflow "{_vc_name}" entrypoint "{_vc_module_name}:{_vc_variable_name}" was not found'
        ) from _vc_error
`;
}

async function parseWorkflow(
  workPath: string,
  name: string,
  config: RawWorkflowConfig
): Promise<WorkflowConfig> {
  if (!WORKFLOW_NAME_RE.test(name)) {
    throw workflowError(
      `workflow name "${name}" is invalid. Names must start with a letter, end with an alphanumeric character, and contain only alphanumeric characters, hyphens, and underscores`
    );
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw workflowError(`workflow "${name}" must be an object`);
  }

  for (const key of Object.keys(config)) {
    if (!WORKFLOW_FIELD_NAMES.has(key)) {
      throw workflowError(`workflow "${name}" has unrecognized field "${key}"`);
    }
  }

  if (typeof config.entrypoint !== 'string') {
    throw workflowError(
      `workflow "${name}" must define string field "entrypoint"`
    );
  }

  const entrypoint = parseModuleEntrypoint(config.entrypoint);
  if (!entrypoint) {
    throw workflowError(
      `workflow "${name}" has invalid entrypoint "${config.entrypoint}". Use "module:object"`
    );
  }

  const existingEntrypoint = await resolveEntrypointFile(
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
