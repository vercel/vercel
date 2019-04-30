import _glob from 'glob';
import { readFile as _readFile } from 'fs'
import { promisify } from 'util'

const glob = promisify(_glob)
const readFile = promisify(_readFile)

/**
 * The key will be placed in .nowignore while the value is the glob
 */
type Ignore = { [key: string]: string }
/**
 * Stubbed version of package.json
 */
type Package = {
  name?: string,
  dependencies?: { [key: string]: string },
}
/**
 * Runtime memory cache
 */
type Cache = {
  manifests: {
    node?: [{
      src: string,
      contents: Package
    }]
  }
}
type ExcludesFalse = <T>(x: T | false) => x is T
type Build = { src: string, use: string }

abstract class Detector {
  static use: string
  static ignore: Ignore
  // object itself is readonly, but members can be mutated
  readonly cache: Cache
  constructor(cache: Cache) {
    this.cache = cache
  }
  populateCache(ignore: Ignore) {
    return this.cacheHandler(this.cache, Object.keys(ignore).map((e) => ignore[e]))
  }
  readonly abstract cacheHandler: (cache: Cache, ignore: string[]) => Promise<void>
  abstract existsAt(): string[]
  abstract guessName(): string | null
}

const ignoreDefault: Ignore = {
  '.git': '**/.git/**',
  '.gitignore': '**/.gitignore',
  '.cache': '**/.cache/**'
}
const ignoreNode: Ignore = {
  'node_modules': '**/node_modules/**'
}

/**
 * Gets all package.json files inside of the working dir.
 * Will set them to `this.cache.manifests.node`
 */
const getNodeManifest = async (cache: Cache, ignore: string[]) => {
  if (!cache.manifests.node) {
    const results = await glob('**/package.json', { nodir: true, ignore })
    for (let i = 0; i < results.length; i++) {
      const src = results[i]
      const data = await readFile(src, { encoding: 'utf8' })
      const { name, dependencies }: Package = JSON.parse(data)
      const contents = { name, dependencies }

      if (!cache.manifests.node) {
        cache.manifests.node = [{
          src,
          contents
        }]
      } else {
        cache.manifests.node.push({
          src,
          contents
        })
      }
    }
  }
}

class NextDetector extends Detector {
  cacheHandler = getNodeManifest
  static use = '@now/next'
  static ignore = {
    ...ignoreDefault,
    ...ignoreNode,
    '.next': '**/.next/**'
  }

  existsAt() {
    const manifests = this.cache.manifests.node
    if (manifests) {
      return manifests
        .map((manifest) => {
          const deps = manifest.contents.dependencies
          if (deps && Object.keys(deps).includes('next')) return manifest.src

          return false
        })
        .filter(Boolean as any as ExcludesFalse)
    }

    return []
  }

  guessName() {
    const manifests = this.cache.manifests.node
    if (manifests) {
      for (let i = 0; i < manifests.length; i++) {
        const name = manifests[i].contents.name
        if (name) return name
      }
    }

    return null
  }
}

async function getInitialData(): Promise<{ builds: Build[], name: string, ignore: string[] }> {
  const detectors = [
    NextDetector
  ]
  const cache: Cache = { manifests: {} }
  let ignore: Ignore = {}
  let name = 'experiment'

  const builders = await Promise.all(
    detectors.map(
      (Detector): Promise<Build[]> => new Promise((resolve) => {
        const Instance = new Detector(cache)

        Instance.populateCache(Detector.ignore).then(() => {
          const found = Instance.existsAt()
          if (found) {
            ignore = Object.assign(Detector.ignore, ignore)

            if (name === 'experiment') {
              const guess = Instance.guessName()
              if (guess) name = guess
            }

            resolve(found.map((src) => ({ src, use: Detector.use })))
          }
        })
      })
    )
  )

  return {
    name,
    ignore: Object.keys(ignore),
    builds: ([] as Build[]).concat(...builders)
  }
}

export default getInitialData
