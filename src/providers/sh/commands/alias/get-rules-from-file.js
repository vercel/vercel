// @flow
import path from 'path'
import { FileNotFound } from './errors'
import { NowError } from './now-error'
import readJSONFile from './read-json-file'
import type { PathRule } from './types'

type JSONRules = {
  rules: PathRule[]
}

async function getRulesFromFile(filePath: string) {
  return typeof filePath === 'string'
    ? await readRulesFile(filePath)
    : null
}

async function readRulesFile(rulesPath: string) {
  const fullPath = path.resolve(process.cwd(), rulesPath)
  const result = await readJSONFile(fullPath)
  if (result instanceof NowError) {
    return result
  }

  if (result === null) {
    return new FileNotFound(fullPath)
  }

  const json: JSONRules = result
  return json.rules
}

export default getRulesFromFile
