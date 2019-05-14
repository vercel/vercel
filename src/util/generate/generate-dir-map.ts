import fs from 'fs'
import { promisify } from 'util'
import { join, parse } from 'path'
import { allDetectors } from './detect-from-manifests'
import ignore from '../ignored'

const ignored = ignore.split('\n')
const readdir = promisify(fs.readdir)
const stat = promisify(fs.stat)

export type dirMap = {
  absolute: string,
  dir: {
    [key: string]: dirMap
  }
  extensions: {
    [type: string]: number | string
  },
  manifests: string[]
}

export async function generateDirMap(dir: string, ignore: { [key: string]: true }, rootDir: string = dir): Promise<dirMap> {
  const result = await readdir(dir)
  const map: dirMap = {
    absolute: dir,
    dir: {},
    extensions: {},
    manifests: []
  }

  await Promise.all(result.map(async (part: string) => {
    const absolutePath = join(dir, part)
    const pathStat = await stat(absolutePath)
    if (['.nowignore', 'now.json'].includes(part)) return

    if (ignored.includes(part)) {
      ignore[part] = true
      return
    }

    if (pathStat.isDirectory()) {
      map.dir[part] = await generateDirMap(absolutePath, ignore, rootDir)
      return
    }

    if (Object.keys(allDetectors).includes(part)) {
      map.manifests.push(part)
      return
    }

    const ext = parse(part).ext
    if (map.extensions[ext]) {
      if (typeof map.extensions[ext] === 'number') {
        map.extensions[ext] = Number(map.extensions[ext]) + 1
      } else {
        map.extensions[ext] = 2
      }
    } else {
      map.extensions[ext] = part
    }
  }))

  return map
}
