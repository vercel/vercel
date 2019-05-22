import fs from 'fs'
import { promisify } from 'util'
import { join, parse } from 'path'
import { allDetectors } from './detect-from-manifests'
import IGNORED from '../ignored'
import { IgnoreType } from './helpers'

const ignored = IGNORED.split('\n')
const readdir = promisify(fs.readdir)
const stat = promisify(fs.stat)

export type DirMap = {
  absolute: string,
  dir: {
    [key: string]: DirMap
  }
  extensions: {
    [type: string]: number | string
  },
  manifests: string[]
}

export async function generateDirMap(dir: string, ignore: IgnoreType, rootDir: string = dir): Promise<DirMap> {
  const result = await readdir(dir)
  const map: DirMap = {
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
      ignore.add(part)
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
