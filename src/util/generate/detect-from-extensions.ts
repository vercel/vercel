import { sep, join } from 'path'
import highlight from '../output/highlight'
import { Build } from './generate-project'
import { dirMap } from './generate-dir-map'
import { choose } from './helpers'
import { locale, extensions } from './metadata'

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

function getExtensionOptions(extension: string, isSingle: boolean) {
  const type = isSingle ? 'single' : 'many'
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
    upload,
    ignore
  }
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
          {
            ...getExtensionOptions(ext, false),
            destructure: locale.destructure.many
          }
        )
      }

      if (use && use !== 'destructure') {
        capture.push(ext)
        src = `${rel ? `${rel.replace('\\', '/')}/` : ''}**/*${ext}`
      } else {
        src = `${rel ? `${rel.replace('\\', '/')}/` : ''}*${ext}`
        if (typeof dirMap.extensions[ext] === 'string') {
          const fileName = highlight(`.${sep}${join(rel, dirMap.extensions[ext] as string)}`)
          use = await choose(
            `What is ${fileName}?`,
            getExtensionOptions(ext, true)
          )
        } else {
          use = await choose(
            `What are the ${dirMap.extensions[ext]} ${ext} files in .${sep}${rel} (shallow)?`,
            getExtensionOptions(ext, false)
          )
        }
      }

      builds.push({ use, src })
    }
  }

  return { builds, capture }
}
