import { sep, join } from 'path'
import { Build } from './generate-project'
import { DirMap } from './generate-dir-map'
import { chooseType, IgnoreType } from './helpers'
import * as Tasks from './metadata/tasks'
import * as Builders from './metadata/builders'
import Extensions from './metadata/extensions'

export function getCountAndDepth(extension: string, map: DirMap): { depth: number, count: number } {
  let depth = 0
  let diveDepth = 0
  let count = 0

  const extensions = map.extensions[extension]
  if (extensions) {
    depth++
    if (typeof extensions === 'number') {
      count += extensions
    } else {
      count++
    }

    Object.keys(map.dir).forEach((name) => {
      const dive = getCountAndDepth(extension, map.dir[name])
      if (diveDepth < dive.depth) diveDepth = dive.depth
      count += dive.count
    })
    depth += diveDepth
  }

  return { depth, count }
}

export function getExtensionOptions(extension: string, type: 'single' | 'many', recovery: 'destructure' | 'manual') {
  const options = Extensions[extension]
    ? Extensions[extension].builders.map((builder) => ({
        [builder.use]: builder.locale
          ? builder.locale[type]
          : `${type === 'single' ? 'This file' : 'These files'} should be built`
      })).reduce((acc, val) => Object.assign(acc, val, {}))
    : {}

  return {
    ...options,
    '@now/static': Builders.noop.locale ? Builders.noop.locale[type] : Builders.noop.use,
    upload: Tasks.upload.locale[type],
    ignore: Tasks.ignore.locale[type],
    [recovery]: Tasks[recovery].locale[type]
  }
}

export function getManualOptions(type: 'single' | 'many'): { [key: string]: string } {
  let options: { [key: string]: string } = {}
  Object.values(Builders).forEach((builder) => {
    options[builder.use] = builder.locale
      ? builder.locale[type]
      : `${type === 'single' ? 'This file' : 'These files'} should be built by ${builder.use}`
  })

  return options
}

type helpers = { choose: chooseType }
export async function detectFromExtensions(map: DirMap, deepCapture: string[], rel: string, ignore: IgnoreType, { choose }: helpers) {
  const builds: Build[] = []
  const capture: string[] = []

  for (let ext in map.extensions) {
    if (Object.prototype.hasOwnProperty.call(map.extensions, ext) && !deepCapture.includes(ext)) {
      const { depth, count } = getCountAndDepth(ext, map)
      let use
      let src

      if (depth > 1) {
        use = await choose(
          `What are the ${count} ${ext ? `.${ext}` : 'extensionless'} files in .${sep}${rel} (${depth} deep)?`,
          getExtensionOptions(ext, 'many', 'destructure')
        )
      }

      if (use && use !== 'destructure') {
        capture.push(ext)
        src = `${rel ? `${rel.replace('\\', '/')}/` : ''}**/*${ext ? `.${ext}` : ''}`
      } else {
        src = `${rel ? `${rel.replace('\\', '/')}/` : ''}*${ext ? `.${ext}` : ''}`
        if (typeof map.extensions[ext] === 'string') {
          const question = `What is .${sep}${join(rel, map.extensions[ext] as string)}?`

          use = await choose(
            question,
            getExtensionOptions(ext, 'single', 'manual')
          )

          if (use === 'manual') {
            use = await choose(
              question,
              getManualOptions('single')
            )
          }
        } else {
          const question = `What are the ${map.extensions[ext]} ${ext ? `.${ext}` : 'extensionless'} files in .${sep}${rel} (shallow)?`
          use = await choose(
            question,
            getExtensionOptions(ext, 'many', 'manual')
          )

          if (use === 'manual') {
            use = await choose(
              question,
              getManualOptions('many')
            )
          }
        }
      }

      if (use === 'ignore') {
        ignore.add(src)
      } else {
        builds.push({ use, src })
      }
    }
  }

  return { builds, capture }
}
