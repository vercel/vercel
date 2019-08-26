import { DeploymentFile } from './utils/hashes'
import {
  parseNowJSON,
  fetch,
  API_DEPLOYMENTS,
  prepareFiles,
  API_DEPLOYMENTS_LEGACY
} from './utils'
import checkDeploymentStatus from './deployment-status'
import { generateQueryString } from './utils/query-string'

export interface Options {
  metadata: DeploymentOptions;
  totalFiles: number;
  path: string | string[];
  token: string;
  teamId?: string;
  force?: boolean;
  isDirectory?: boolean;
  defaultName?: string;
  preflight?: boolean;
}

async function* createDeployment(
  metadata: DeploymentOptions,
  files: Map<string, DeploymentFile>,
  options: Options
): AsyncIterableIterator<{ type: string; payload: any }> {
  const preparedFiles = prepareFiles(files, options)

  let apiDeployments =
    metadata.version === 2 ? API_DEPLOYMENTS : API_DEPLOYMENTS_LEGACY
  try {
    const dpl = await fetch(
      `${apiDeployments}${generateQueryString(options)}`,
      options.token,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.token}`
        },
        body: JSON.stringify({
          ...metadata,
          files: preparedFiles
        })
      }
    )

    const json = await dpl.json()

    if (!dpl.ok || json.error) {
      // Return error object
      return yield { type: 'error', payload: json.error ? { ...json.error, status: dpl.status } : { ...json, status: dpl.status } }
    }

    yield { type: 'created', payload: json }
  } catch (e) {
    return yield { type: 'error', payload: e }
  }
}

const getDefaultName = (
  path: string | string[] | undefined,
  isDirectory: boolean | undefined,
  files: Map<string, DeploymentFile>
): string => {
  if (isDirectory && typeof path === 'string') {
    const segments = path.split('/')

    return segments[segments.length - 1]
  } else {
    const filePath = Array.from(files.values())[0].names[0]
    const segments = filePath.split('/')

    return segments[segments.length - 1]
  }
}

export default async function* deploy(
  files: Map<string, DeploymentFile>,
  options: Options
): AsyncIterableIterator<{ type: string; payload: any }> {
  const nowJson: DeploymentFile | undefined = Array.from(files.values()).find(
    (file: DeploymentFile): boolean => {
      return Boolean(
        file.names.find((name: string): boolean => name.includes('now.json'))
      )
    }
  )
  const nowJsonMetadata: NowJsonOptions = parseNowJSON(nowJson)

  const meta = options.metadata || {}
  const metadata = { ...nowJsonMetadata, ...meta }

  // Check if we should default to a static deployment
  if (!metadata.version && !metadata.name) {
    metadata.version = 2
    metadata.name =
      options.totalFiles === 1
        ? 'file'
        : getDefaultName(options.path, options.isDirectory, files)
  }

  if (!metadata.name) {
    metadata.name =
      options.defaultName ||
      getDefaultName(options.path, options.isDirectory, files)
  }

  if (metadata.version === 1 && !metadata.deploymentType) {
    metadata.deploymentType = nowJsonMetadata.type
  }

  delete metadata.github
  delete metadata.scope

  let deployment: Deployment | undefined

  try {
    for await (const event of createDeployment(metadata, files, options)) {
      if (event.type === 'created') {
        deployment = event.payload
      }

      yield event
    }
  } catch (e) {
    return yield { type: 'error', payload: e }
  }

  if (deployment) {
    if (deployment.readyState === 'READY') {
      return yield { type: 'ready', payload: deployment }
    }

    try {
      for await (const event of checkDeploymentStatus(
        deployment,
        options.token,
        metadata.version,
        options.teamId
      )) {
        yield event
      }
    } catch (e) {
      return yield { type: 'error', payload: e }
    }
  }
}
