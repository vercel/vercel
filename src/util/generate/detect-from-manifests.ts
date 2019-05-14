import fs from 'fs'
import { join, sep } from 'path'
import { promisify } from 'util'
import { locale } from './metadata'
import { outputFile, choose } from './helpers'

const readFile = promisify(fs.readFile)

type Package = {
  name?: string,
  dependencies?: { [key: string]: string },
  scripts?: { [key: string]: string }
}
type Detected = { use: string, build?: string, config?: { [key: string]: string }, locale?: string, dev?: string }
type Detector = (contents: Object) => Promise<Detected | false>
type NodeDetector = (contents: Package) => Promise<Detected | false>

const NextDetector: NodeDetector = async ({ dependencies }) => dependencies && dependencies.next ? { use: '@now/next', build: 'next build' } : false
const GatsbyDetector: NodeDetector = async ({ dependencies }) => dependencies && dependencies.gatsby ? { locale: 'gatsby', use: '@now/static-build', dev: 'gatsby develop -p $PORT', build: 'gatsby build', config: { distDir: 'public' } } : false
const BuildDetector: NodeDetector = async ({ scripts }) => scripts && scripts.build ? { use: '@now/static-build' } : false

export const allDetectors: {
  'package.json': NodeDetector[],
  [key: string]: Detector[]
} = {
  'package.json': [
    NextDetector,
    GatsbyDetector,
    BuildDetector
  ]
}

export async function detectFromManifests(manifests: string[], absolute: string, rel: string) {
  for (let i = 0; i < manifests.length; i++) {
    const detectors = allDetectors[manifests[i]]
    if (detectors) {
      let needsUpdate = false
      const data = JSON.parse(await readFile(join(absolute, manifests[i]), { encoding: 'utf8' }))
      const options: {[key: string]: string} = {}
      const buildCommand: { [key: string]: string | undefined } = {}
      const devCommand: { [key: string]: string | undefined } = {}
      const conf: { [key: string]: { [key: string]: string } | undefined } = {}

      for (let k in detectors) {
        const detector = detectors[k]
        const result = await detector(data)

        if (result && !options[result.use]) {
          const localeKey = result.locale || result.use

          buildCommand[result.use] = result.build
          devCommand[result.use] = result.dev
          conf[result.use] = result.config

          options[result.use] = 
            (locale[localeKey] && locale[localeKey].many)
            || `This is a ${localeKey} project`
        }
      }

      options.destructure = locale.destructure.many
      options.ignore = `The file ${manifests[i]} is not relevant`

      const use = Object.keys(options).length > 2
        ? await choose(`What is in .${sep}${rel}?`, options)
        : null

      if (!data.scripts) data.scripts = {}
      if (use && data.dependencies && !data.scripts['now-dev'] && devCommand[use]) {
        data.scripts['now-dev'] = devCommand[use]
        needsUpdate = true
      }
      if (data.dependencies && !data.scripts['now-build']) {
        data.scripts['now-build'] = use && buildCommand[use] ? buildCommand[use] : 'npm run build'
        needsUpdate = true
      }
      if (needsUpdate) outputFile(absolute, manifests[i], JSON.stringify(data, null, 2), true)

      if (use === 'destructure') break
      if (use === 'ignore') continue

      if (use) return [{
        use,
        config: conf[use],
        src: `${rel ? `${rel.replace('\\', '/')}/` : ''}${manifests[i]}`
      }]
    }
  }
}
