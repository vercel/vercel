// @flow
import path from 'path'
import { CantParseJSONFile } from './errors'
import readJSONFile from './read-json-file'
import type { Config } from './types'

export type Package = {
  name: string,
  now?: Config
}

async function readPackage(file?: string) {
  const pkgFilePath = file || path.resolve(process.cwd(), 'package.json')
  const result = await readJSONFile(pkgFilePath)
  if (result instanceof CantParseJSONFile) {
    return result
  }

  if (result !== null) {
    const pkg: Package = result
    return pkg
  }

  return result
}

export default readPackage
