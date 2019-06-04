import fs from 'fs'
import { join, sep } from 'path'
import { promisify } from 'util'
import { outputFileType, chooseType, IgnoreType } from './helpers'
import Manifests from './metadata/manifests'
import * as Tasks from './metadata/tasks'

const readFile = promisify(fs.readFile)

type helpers = { choose: chooseType, outputFile: outputFileType }
export async function detectFromManifests(manifests: string[], absolute: string, rel: string, ignore: IgnoreType, { choose, outputFile }: helpers) {
  for (let i = 0; i < manifests.length; i++) {
    const detectors = Manifests[manifests[i]]
    if (detectors) {
      let needsUpdate = false
      const data = detectors.parseManifest(readFile(join(absolute, manifests[i]), { encoding: 'utf8' }))
      const options: {[key: string]: string} = {}
      const buildCommand: { [key: string]: string | undefined } = {}
      const devCommand: { [key: string]: string | undefined } = {}
      const conf: { [key: string]: { [key: string]: string } | undefined } = {}

      for (let k in detectors.detectors) {
        const detector = detectors.detectors[k]
        const result = await detector(data)

        if (result && !options[result.use]) {
          const localeKey = result.locale || result.use

          buildCommand[result.use] = result.build
          devCommand[result.use] = result.dev
          conf[result.use] = result.config

          options[result.use] = result.locale || `This is a ${localeKey} project`
        }
      }

      options.destructure = Tasks.destructure.locale.many
      options.ignore = `The file ${manifests[i]} is not relevant`

      const use = Object.keys(options).length > 2
        ? await choose(`What is in .${sep}${rel}?`, options)
        : null

      if (use === 'destructure') break
      if (use === 'ignore') {
        ignore.add(manifests[i])
        continue
      }

      if (use) {
        const update = detectors.addScripts(data, { build: buildCommand[use], dev: devCommand[use] })
        if (update) outputFile(absolute, manifests[i], update, true)

        return [{
          use,
          config: conf[use],
          src: `${rel ? `${rel.replace('\\', '/')}/` : ''}${manifests[i]}`
        }]
      }
    }
  }
}
