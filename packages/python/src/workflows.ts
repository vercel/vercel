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
import { runUvPythonCommand } from './uv';

const WORKFLOW_OUTPUT_DIR = '_py_workflows';
const WORKFLOW_NAMESPACE_PATTERN = /^[a-z][a-z0-9]*$/;
const namespaceScriptPath = join(
  __dirname,
  '..',
  'templates',
  'vc_workflow_detect.py'
);
const namespaceScript = fs.readFileSync(namespaceScriptPath, 'utf-8');

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
  namespace?: string | null;
}

interface RawWorkflow {
  entrypoint?: unknown;
}

interface WorkflowNamespaceResult {
  namespace?: unknown;
  error?: string;
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

export function getWorkflowTopicPattern(namespace?: string | null): string {
  return namespace ? `__${namespace}_wkf_*` : WORKFLOW_TOPIC_PATTERN;
}

export async function detectWorkflowNamespaces(opts: {
  workflows: PyprojectWorkflow[];
  uvPath: string;
  uvRunArgs?: string[];
  env: NodeJS.ProcessEnv;
  workPath: string;
}): Promise<PyprojectWorkflow[]> {
  const { workflows, uvPath, uvRunArgs, env, workPath } = opts;
  const detected = await Promise.all(
    workflows.map(async workflow => ({
      ...workflow,
      namespace: await detectWorkflowNamespace({
        uvPath,
        uvRunArgs,
        env,
        workPath,
        moduleName: workflow.moduleName,
        variableName: workflow.variableName,
      }),
    }))
  );
  assertUniqueWorkflowNamespaces(detected);
  return detected;
}

export async function detectWorkflowNamespacesFromSource(opts: {
  workflows: PyprojectWorkflow[];
  uvPath: string;
  uvRunArgs?: string[];
  env: NodeJS.ProcessEnv;
  workPath: string;
}): Promise<PyprojectWorkflow[]> {
  const { workflows, uvPath, uvRunArgs, env, workPath } = opts;
  const detected = await Promise.all(
    workflows.map(async workflow => ({
      ...workflow,
      namespace: await detectWorkflowNamespaceFromSource({
        uvPath,
        uvRunArgs,
        env,
        workPath,
        entrypoint: workflow.entrypoint,
        variableName: workflow.variableName,
      }),
    }))
  );
  assertUniqueWorkflowNamespaces(detected);
  return detected;
}

export async function detectWorkflowNamespace(opts: {
  uvPath: string;
  uvRunArgs?: string[];
  env: NodeJS.ProcessEnv;
  workPath: string;
  moduleName: string;
  variableName: string;
}): Promise<string | null> {
  const { uvPath, uvRunArgs, env, workPath, moduleName, variableName } = opts;
  return runWorkflowNamespaceDetection({
    uvPath,
    uvRunArgs,
    env,
    workPath,
    args: [moduleName, variableName],
    entrypointLabel: `${moduleName}:${variableName}`,
  });
}

export async function detectWorkflowNamespaceFromSource(opts: {
  uvPath: string;
  uvRunArgs?: string[];
  env: NodeJS.ProcessEnv;
  workPath: string;
  entrypoint: string;
  variableName: string;
}): Promise<string | null> {
  const { uvPath, uvRunArgs, env, workPath, entrypoint, variableName } = opts;
  return runWorkflowNamespaceDetection({
    uvPath,
    uvRunArgs,
    env,
    workPath,
    args: ['--source', entrypoint, variableName],
    entrypointLabel: `${entrypoint}:${variableName}`,
  });
}

async function runWorkflowNamespaceDetection(opts: {
  uvPath: string;
  uvRunArgs?: string[];
  env: NodeJS.ProcessEnv;
  workPath: string;
  args: string[];
  entrypointLabel: string;
}): Promise<string | null> {
  const { uvPath, uvRunArgs, env, workPath, args, entrypointLabel } = opts;
  let stdout: string;
  try {
    const result = await runUvPythonCommand({
      uvPath,
      uvRunArgs,
      args: ['-c', namespaceScript, ...args],
      cwd: workPath,
      env: {
        ...env,
        WORKFLOW_TARGET_WORLD: 'local',
      },
    });
    stdout = result.stdout;
  } catch (err: any) {
    let detail = err?.stderr || err?.message || String(err);
    try {
      const parsed = JSON.parse(err?.stdout) as WorkflowNamespaceResult;
      if (parsed.error) detail = parsed.error;
    } catch {}
    throw workflowDetectionError(
      `Failed to inspect workflow entrypoint "${entrypointLabel}": ${detail}`
    );
  }

  let parsed: WorkflowNamespaceResult;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw workflowDetectionError(
      `Workflow namespace detection returned invalid JSON: ${stdout}`
    );
  }

  if (!Object.prototype.hasOwnProperty.call(parsed, 'namespace')) {
    throw workflowDetectionError(
      `Workflow namespace detection returned no namespace for "${entrypointLabel}"`
    );
  }

  const namespace = parsed.namespace;
  if (namespace !== null && typeof namespace !== 'string') {
    throw workflowDetectionError(
      `Workflow entrypoint "${entrypointLabel}" returned a non-string namespace`
    );
  }
  if (
    typeof namespace === 'string' &&
    !WORKFLOW_NAMESPACE_PATTERN.test(namespace)
  ) {
    throw workflowDetectionError(
      `Workflow entrypoint "${entrypointLabel}" returned invalid namespace "${namespace}"`
    );
  }

  return namespace;
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

function assertUniqueWorkflowNamespaces(workflows: PyprojectWorkflow[]): void {
  const entrypointByNamespace = new Map<string | null, string>();
  for (const workflow of workflows) {
    const namespace = workflow.namespace ?? null;
    const existingEntrypoint = entrypointByNamespace.get(namespace);
    if (existingEntrypoint) {
      const label =
        namespace === null
          ? 'the default namespace'
          : `namespace "${namespace}"`;
      throw workflowError(
        `workflow entrypoints "${existingEntrypoint}" and "${workflow.moduleName}:${workflow.variableName}" both use ${label}`
      );
    }
    entrypointByNamespace.set(
      namespace,
      `${workflow.moduleName}:${workflow.variableName}`
    );
  }
}

function workflowDetectionError(message: string): NowBuildError {
  return new NowBuildError({
    code: 'PYTHON_WORKFLOW_DETECTION_FAILED',
    message,
  });
}
