// @flow
import path from 'path'
import { NowError } from '../../util/now-error'
import { Output } from '../../util/types'
import getConfig from './get-config'
import readPackage from './read-package'

async function getAppName(output: Output, localConfig?: string) {
  const config = await getConfig(output, localConfig)

  // If the name is in the configuration, return it
  if (!(config instanceof NowError) && config.name) {
    return config.name
  }

  // Otherwise try to get it from the package
  if (!(config instanceof NowError) && (!config.type || config.type === "npm")) {
    const pkg = await readPackage()
    if (!(pkg instanceof NowError) && pkg) {
      return pkg.name
    }
  }

  // Finally fallback to directory
  return path.basename(path.resolve(process.cwd(), localConfig || ''))
}

export default getAppName
