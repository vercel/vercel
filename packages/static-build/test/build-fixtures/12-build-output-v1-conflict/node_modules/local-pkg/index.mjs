import { join, dirname } from 'path'
import { promises as fs, existsSync } from 'fs'
import { createRequire } from 'module'

export { loadPackageJSON, isPackageListed } from './dist/shared.mjs'

const _require = createRequire(import.meta.url)

export function resolveModule(name, options) {
  try {
    return _require.resolve(name, options)
  }
  catch (e) {
    return undefined
  }
}

export function importModule(path) {
  return import(path).then((i) => {
    if (i && i.default && i.default.__esModule)
      return i.default
    return i
  })
}

export function isPackageExists(name, options) {
  return !!resolvePackage(name, options)
}

export async function getPackageInfo(name, options) {
  const entry = resolvePackage(name, options)
  if (!entry)
    return

  const packageJsonPath = searchPackageJSON(entry)

  if (!packageJsonPath)
    return

  const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))

  return {
    name,
    version: pkg.version,
    rootPath: dirname(packageJsonPath),
    packageJsonPath,
    packageJson: pkg,
  }
}

function resolvePackage(name, options = {}) {
  try {
    return _require.resolve(`${name}/package.json`, options)
  }
  catch {
  }
  try {
    return _require.resolve(name, options)
  }
  catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND')
      console.error(e)
    return false
  }
}

function searchPackageJSON(dir) {
  let packageJsonPath
  while (true) {
    if (!dir)
      return
    const newDir = dirname(dir)
    if (newDir === dir)
      return
    dir = newDir
    packageJsonPath = join(dir, 'package.json')
    if (existsSync(packageJsonPath))
      break
  }

  return packageJsonPath
}
