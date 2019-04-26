type Build = { src: string, use: string }
type Ignore = { [key: string]: true }
type Cache = {
  manifests: {
    node?: Object
  }
}

abstract class Detector {
  static use: string
  cache: Cache
  constructor(cache: Cache) {
    this.cache = cache
  }
  abstract existsAt(): Promise<string[]>
  abstract guessName(): Promise<string | null>
  abstract ignore(): Ignore
}

const ignoreDefault = {
  '.git': true,
  '.gitignore': true,
  '.cache': true
}
const ignoreNode = {
  'node_modules': true
}

class NextDetector extends Detector {
  static use = '@now/next'

  async existsAt() {
    // search for package.json recursively and return an array of all found
    return [
      'package.json'
    ]
  }

  async guessName() {
    // look in package.json to see if the project is named
    return 'nextjs-project'
  }
  
  ignore() {
    return {
      ...ignoreDefault,
      ...ignoreNode,
      '.next': true
    } as Ignore
  }
}

async function getDataFromCwd (): Promise<{ builds: Build[], name: string, ignore: Ignore }> {
  const cache: Cache = { manifests: {} }
  let name = 'experiment'
  let ignore: Ignore = {}
  const detectors = [
    NextDetector
  ]

  const builders = await Promise.all(
    detectors.map(
      (Detector): Promise<Build[]> => new Promise((resolve) => {
        const buildType = new Detector(cache)

        buildType.existsAt().then((existing) => {
          if (existing) ignore = Object.assign(buildType.ignore(), ignore)
          resolve(existing.map((src) => ({ src, use: Detector.use })))
        })

        if (name === 'experiment') {
          buildType.guessName().then((guess) => {
            if (guess) name = guess
          })
        }
      })
    )
  )

  return {
    name,
    ignore,
    builds: ([] as Build[]).concat(...builders)
  }
}

export default getDataFromCwd
