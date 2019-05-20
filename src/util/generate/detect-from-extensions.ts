import { sep, join } from 'path'
import highlight from '../output/highlight'
import { Build } from './generate-project'
import { dirMap } from './generate-dir-map'
import { choose } from './helpers'
import { locale, extensions, builders } from './metadata'

export function getCountAndDepth(extension: string, dirMap: dirMap): { depth: number, count: number } {
  let depth = 0
  let diveDepth = 0
  let count = 0

  const extensions = dirMap.extensions[extension]
  if (extensions) {
    depth++
    if (typeof extensions === 'string') {
      count++
    } else {
      count += extensions
    }

    Object.keys(dirMap.dir).forEach((dir) => {
      const dive = getCountAndDepth(extension, dirMap.dir[dir])
      if (diveDepth < dive.depth) diveDepth = dive.depth
      count += dive.count
    })
    depth += diveDepth
  }

  return { depth, count }
}

function getExtensionOptions(extension: string, type: 'single' | 'many', recovery: 'destructure' | 'manual') {
  const upload = locale.upload[type]
  const ignore = locale.ignore[type]
  const options = extensions[extension]
    ? extensions[extension].map((builder) => ({
        [builder]: locale[builder]
          ? locale[builder][type]
          : `${type === 'single' ? 'This file' : 'These files'} should be built`
      })).reduce((acc, val) => Object.assign(acc, val, {}))
    : {}

  return {
    ...options,
    '@now/static': locale['@now/static'][type],
    upload,
    ignore,
    [recovery]: locale[recovery][type]
  }
}

function getManualOptions(type: 'single' | 'many'): { [key: string]: string } {
  let options: { [key: string]: string } = {}
  Object.values(builders).forEach((builder) => {
    options[builder] = locale[builder]
      ? locale[builder][type]
      : `${type === 'single' ? 'This file' : 'These files'} should be built by ${builder}`
  })

  return options
}

export async function detectFromExtensions(dirMap: dirMap, deepCapture: string[], rel: string) {
  const builds: Build[] = []
  const capture: string[] = []

  for (let ext in dirMap.extensions) {
    if (Object.prototype.hasOwnProperty.call(dirMap.extensions, ext) && !deepCapture.includes(ext)) {
      const { depth, count } = getCountAndDepth(ext, dirMap)
      let use
      let src

      if (depth > 1) {
        use = await choose(
          `What are the ${count} ${ext} files in .${sep}${rel} (${depth} deep)?`,
          getExtensionOptions(ext, 'many', 'destructure')
        )
      }

      if (use && use !== 'destructure') {
        capture.push(ext)
        src = `${rel ? `${rel.replace('\\', '/')}/` : ''}**/*${ext}`
      } else {
        src = `${rel ? `${rel.replace('\\', '/')}/` : ''}*${ext}`
        if (typeof dirMap.extensions[ext] === 'string') {
          const fileName = highlight(`.${sep}${join(rel, dirMap.extensions[ext] as string)}`)
          const question = `What is ${fileName}?`

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
          const question = `What are the ${dirMap.extensions[ext]} ${highlight(ext)} files in .${highlight(sep + rel)} (shallow)?`
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

      builds.push({ use, src })
    }
  }

  return { builds, capture }
}
