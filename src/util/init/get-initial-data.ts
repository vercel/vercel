import _glob from 'glob';
import { readFile as _readFile } from 'fs'
import { promisify } from 'util'

const glob = promisify(_glob)
const readFile = promisify(_readFile)

type ExcludesFalse = <T>(x: T | false) => x is T
type Build = { src: string, use: string }
type Ignore = { [key: string]: string }
type Package = {
  name?: string,
  dependencies?: { [key: string]: string },
}
type Cache = {
  manifests: {
    node?: [{
      src: string,
      contents: Package
    }]
  }
}

abstract class Detector {
  static use: string
  // object itself is readonly, but members can be mutated
  readonly cache: Cache
  constructor(cache: Cache) {
    this.cache = cache
  }
  populateCache(ignore: Ignore) {
    return this.cacheHandler(this.cache, Object.keys(ignore).map((e) => ignore[e]))
  }
  readonly abstract cacheHandler: (cache: Cache, ignore: string[]) => Promise<void>
  abstract existsAt(): Promise<string[]>
  abstract guessName(): Promise<string | null>
  abstract ignore(): Ignore
}

const ignoreDefault = {
  '.git': '**/.git',
  '.gitignore': '**/.gitignore',
  '.cache': '**/.cache'
}
const ignoreNode = {
  'node_modules': '**/node_modules'
}

const getNodeManifest = async (cache: Cache, ignore: string[]) => {
  if (!cache.manifests.node) {
    (await glob('**/package.json', { nodir: true, ignore })).forEach((src) => {
      readFile(src, { encoding: 'utf8' }).then((data) => {
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
      }, () => {})
    })
  }
}

class NextDetector extends Detector {
  static use = '@now/next'
  cacheHandler = getNodeManifest

  async existsAt() {
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

  async guessName() {
    const manifests = this.cache.manifests.node
    if (manifests) {
      for (let i = 0; i < manifests.length; i++) {
        const name = manifests[i].contents.name
        if (name) return name
      }
    }

    return null
  }

  ignore() {
    return {
      ...ignoreDefault,
      ...ignoreNode,
      '.next': '**/.next'
    } as Ignore
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
        const buildType = new Detector(cache)
        const buildIgnore = buildType.ignore()

        buildType.populateCache(buildIgnore).then(() => {
          buildType.existsAt().then((existing) => {
            if (existing) {
              ignore = Object.assign(buildIgnore, ignore)
              resolve(existing.map((src) => ({ src, use: Detector.use })))
            }
          })
  
          if (name === 'experiment') {
            buildType.guessName().then((guess) => {
              if (guess) name = guess
            })
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
