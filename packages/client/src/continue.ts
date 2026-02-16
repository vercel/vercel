import { join } from 'path';
import fs from 'fs-extra';

import type { Dispatcher } from 'undici';
import type { Deployment, DeploymentEventType } from './types';
import { checkDeploymentStatus } from './check-deployment-status';
import { fetch, buildFileTree, createDebug, prepareFiles } from './utils';
import { hashes, mapToObject, FilesMap } from './utils/hashes';
import { isReady, isAliasAssigned } from './utils/ready-state';
import { uploadFiles, UploadProgress } from './upload';
import { DeploymentError } from './errors';

/**
 * Continues a manual deployment by uploading build outputs and calling the
 * continue endpoint. Waits for READY state unless the caller stops consuming
 * events early.
 */
export async function* continueDeployment(options: {
  dispatcher?: Dispatcher;
  apiUrl?: string;
  debug?: boolean;
  deploymentId: string;
  path: string;
  teamId?: string;
  token: string;
  userAgent?: string;
  vercelOutputDir?: string;
}): AsyncIterableIterator<{ type: DeploymentEventType; payload: any }> {
  const debug = createDebug(options.debug);
  debug(`Continuing deployment: ${options.deploymentId}`);
  const outputDir =
    options.vercelOutputDir || join(options.path, '.vercel', 'output');

  /**
   * We need to ensure that the output directory exists before proceeding with
   * the continuation. This is important because we only allow continuing for
   * prebuilt deployments.
   */
  if (!(await fs.pathExists(outputDir))) {
    return yield {
      type: 'error',
      payload: new DeploymentError({
        code: 'output_dir_not_found',
        message: `Output directory not found at ${outputDir}. Run 'vercel build' first.`,
      }),
    };
  }

  const { fileList } = await buildFileTree(
    options.path,
    { isDirectory: true, prebuilt: true, vercelOutputDir: outputDir },
    debug
  );

  const files = await hashes(fileList);
  debug(`Calculated ${files.size} unique hashes`);
  yield { type: 'hashes-calculated', payload: mapToObject(files) };

  let deployment: Deployment | undefined;
  let result = await postContinue({
    deploymentId: options.deploymentId,
    files,
    outputDir,
    path: options.path,
    token: options.token,
    teamId: options.teamId,
    apiUrl: options.apiUrl,
    userAgent: options.userAgent,
    dispatcher: options.dispatcher,
    debug: options.debug,
  });

  if (result.type === 'missing_files') {
    debug(`Uploading ${result.missing.length} missing files...`);

    const uploads = result.missing.map(
      sha => new UploadProgress(sha, files.get(sha)!)
    );

    yield {
      type: 'file-count',
      payload: { total: files, missing: result.missing, uploads },
    };

    for await (const event of uploadFiles({
      dispatcher: options.dispatcher,
      apiUrl: options.apiUrl,
      debug: options.debug,
      teamId: options.teamId,
      token: options.token,
      userAgent: options.userAgent,
      shas: result.missing,
      files,
      uploads,
    })) {
      if (event.type === 'error') {
        return yield event;
      }
      yield event;
    }

    yield { type: 'all-files-uploaded', payload: files };

    result = await postContinue({
      deploymentId: options.deploymentId,
      files,
      outputDir,
      path: options.path,
      token: options.token,
      teamId: options.teamId,
      apiUrl: options.apiUrl,
      userAgent: options.userAgent,
      dispatcher: options.dispatcher,
      debug: options.debug,
    });

    if (result.type === 'missing_files') {
      return yield {
        type: 'error',
        payload: {
          code: 'missing_files',
          message: 'Missing files',
          missing: result.missing,
        },
      };
    }
  }

  if (result.type === 'error') {
    return yield { type: 'error', payload: result.error };
  }

  if (result.type === 'success') {
    deployment = result.deployment;
    yield { type: 'created', payload: deployment };
  }

  if (!deployment) {
    return yield {
      type: 'error',
      payload: new DeploymentError({
        code: 'continue_failed',
        message: 'Failed to continue deployment after uploading files',
      }),
    };
  }

  if (isReady(deployment) && isAliasAssigned(deployment)) {
    yield { type: 'ready', payload: deployment };
    return yield { type: 'alias-assigned', payload: deployment };
  }

  yield* checkDeploymentStatus(deployment, {
    dispatcher: options.dispatcher,
    apiUrl: options.apiUrl,
    debug: options.debug,
    path: options.path,
    teamId: options.teamId,
    token: options.token,
    userAgent: options.userAgent,
  });
}

async function postContinue(options: {
  dispatcher?: Dispatcher;
  apiUrl?: string;
  debug?: boolean;
  deploymentId: string;
  files: FilesMap;
  outputDir: string;
  path: string;
  teamId?: string;
  token: string;
  userAgent?: string;
}): Promise<
  | { type: 'success'; deployment: Deployment }
  | { type: 'missing_files'; missing: string[] }
  | { type: 'error'; error: any }
> {
  const debug = createDebug(options.debug);

  debug(`Calling continue deployment endpoint for ${options.deploymentId}`);
  const response = await fetch(
    `/deployments/${options.deploymentId}/continue${
      options.teamId ? `?teamId=${options.teamId}` : ''
    }`,
    options.token,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: prepareFiles(options.files, {
          isDirectory: true,
          path: options.path,
          token: options.token,
        }),
      }),
      apiUrl: options.apiUrl,
      userAgent: options.userAgent,
      dispatcher: options.dispatcher,
    }
  );

  let result;
  try {
    result = await response.json();
  } catch {
    return {
      type: 'error',
      error: new Error('Invalid JSON response from continue endpoint'),
    };
  }

  if (!response.ok || result.error) {
    if (
      result.error?.code === 'missing_files' ||
      result.code === 'missing_files'
    ) {
      debug(
        `Continue deployment returned missing_files: ${(result.error?.missing || result.missing || []).length} files`
      );
      return {
        type: 'missing_files',
        missing: result.error?.missing || result.missing || [],
      };
    }

    debug('Continue deployment request failed');
    return {
      type: 'error',
      error: result.error
        ? { ...result.error, status: response.status }
        : { ...result, status: response.status },
    };
  }

  debug('Continue deployment succeeded');
  return { type: 'success', deployment: result };
}
