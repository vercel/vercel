import { readdir as readRootFolder, lstatSync } from 'fs-extra'

import readdir from 'recursive-readdir'
import hashes, { mapToObject } from './utils/hashes'
import uploadAndDeploy from './upload'
import { getNowIgnore } from './utils'
import { DeploymentError } from './errors'

export { EVENTS } from './utils'

export default function buildCreateDeployment(version: number): CreateDeploymentFunction {
  return async function* createDeployment(
    path: string | string[],
    options: DeploymentOptions = {}
  ): AsyncIterableIterator<any> {
    if (typeof path !== 'string' && !Array.isArray(path)) {
      throw new DeploymentError({
        code: 'missing_path',
        message: 'Path not provided'
      })
    }

    if (typeof options.token !== 'string') {
      throw new DeploymentError({
        code: 'token_not_provided',
        message: 'Options object must include a `token`'
      })
    }

    const isDirectory = !Array.isArray(path) && lstatSync(path).isDirectory()

    // Get .nowignore
    let rootFiles

    if (isDirectory && !Array.isArray(path)) {
      rootFiles = await readRootFolder(path)
    } else if (Array.isArray(path)) {
      rootFiles = path
    } else {
      rootFiles = [path]
    }

    let ignores: string[] = await getNowIgnore(rootFiles, path)

    let fileList

    if (isDirectory && !Array.isArray(path)) {
      // Directory path
      fileList = await readdir(path, ignores)
    } else if (Array.isArray(path)) {
      // Array of file paths
      fileList = path
    } else {
      // Single file
      fileList = [path]
    }

    const files = await hashes(fileList)

    yield { type: 'hashes-calculated', payload: mapToObject(files) }

    const { token, teamId, force, defaultName, ...metadata } = options

    metadata.version = version

    const deploymentOpts = {
      totalFiles: files.size,
      token,
      isDirectory,
      path,
      teamId,
      force,
      defaultName,
      metadata
    }

    for await (const event of uploadAndDeploy(files, deploymentOpts)) {
      yield event
    }
  }
}
