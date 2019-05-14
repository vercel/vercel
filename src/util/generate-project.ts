import fs from 'fs'
import { join, parse, relative, sep } from 'path'
import { promisify } from 'util'
// @ts-ignore
import listInput from './input/list'
import ignore from './ignored'
import wait from './output/wait'
import highlight from './output/highlight'
import { Output } from './output'

type dirMap = {
  absolute: string,
  dir: {
    [key: string]: dirMap
  }
  extensions: {
    [type: string]: number | string
  },
  manifests: string[]
}
type Package = {
  name?: string,
  dependencies?: { [key: string]: string },
  scripts?: { [key: string]: string }
}
type Build = { src: string, use: string }
type nowJson = {
  version: number,
  name?: string,
  builds: Array<Build>
}
type Project = { config: nowJson, ignore: string[] }
type Detected = { use: string, build?: string, config?: { [key: string]: string }, locale?: string, dev?: string }
type Detector = (contents: Object) => Promise<Detected | false>
type NodeDetector = (contents: Package) => Promise<Detected | false>

const ignored = ignore.split('\n')
const readdir = promisify(fs.readdir)
const readFile = promisify(fs.readFile)
const stat = promisify(fs.stat)

const NextDetector: NodeDetector = async ({ dependencies }) => dependencies && dependencies.next ? { use: '@now/next', build: 'next build' } : false
const GatsbyDetector: NodeDetector = async ({ dependencies }) => dependencies && dependencies.gatsby ? { locale: 'gatsby', use: '@now/static-build', dev: 'gatsby develop -p $PORT', build: 'gatsby build', config: { distDir: 'public' } } : false
const BuildDetector: NodeDetector = async ({ scripts }) => scripts && scripts.build ? { use: '@now/static-build' } : false
const locale: {
  [key: string]: {
    single: string,
    many: string
  }
} = {
  '@now/static': {
    single: 'This is a public static file',
    many: 'These are public static files'
  },
  '@now/static-build': {
    single: 'This file needs to be built as static',
    many: 'These files need to be built as static'
  },
  '@now/next': {
    single: 'This is a Next.js project',
    many: 'This is a Next.js project'
  },
  '@now/node': {
    single: 'This is a Node.js lambda',
    many: 'Each of these are indivudual Node.js endpoints'
  },
  '@now/node-server': {
    single: 'This is Node.js app listening on a port',
    many: 'These form a Node.js app listening on a port'
  },
  'gatsby': {
    single: 'This is a Gatsby project',
    many: 'This is a Gatsby project'
  },
  upload: {
    single: 'This is a dependancy of my code',
    many: 'These are dependancies of my code'
  },
  ignore: {
    single: 'This is a meta file',
    many: 'These are meta files'
  },
  destructure: {
    single: 'This file is built with multiple builders',
    many: 'These files are built with multiple builders'
  }
}
const internal = [
  'upload',
  'ignore',
  'destructure'
]
const manifests: {
  'package.json': NodeDetector[],
  [key: string]: Detector[]
} = {
  'package.json': [
    NextDetector,
    GatsbyDetector,
    BuildDetector
  ]
}
const extensions: {
  [key: string]: string[]
} = {
  '.js': [
    '@now/node',
    '@now/node-server',
    '@now/static'
  ],
  '.ts': [
    '@now/node',
    '@now/node-server'
  ],
  '.html': ['@now/static'],
  '.htm': ['@now/static'],
  '.css': ['@now/static'],
  '.rs': ['@now/rust'],
  '.md': ['@now/md'],
  '.markdown': ['@now/md'],
  '.go': ['@now/go'],
  '.php': ['@now/php'],
  '.py': ['@now/python']
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

    if (Object.keys(manifests).includes(part)) {
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

async function choose(message: string, options: {[key: string]: string}) {
  const choices = Object.keys(options).map(name => ({
    name: `${options[name]} (${name})`,
    value: name,
    short: name
  }))

  return listInput({
    message,
    separator: false,
    choices
  })
}

function getDepthandBreadth(extension: string, dirMap: dirMap): { depth: number, breadth: number } {
  const extensions = dirMap.extensions[extension]
  let depth = 0;
  let breadth = 0;

  if (extensions) {
    depth++
    if (typeof extensions === 'string') {
      breadth++
    } else {
      breadth += extensions
    }

    Object.keys(dirMap.dir).forEach((dir) => {
      const dive = getDepthandBreadth(extension, dirMap.dir[dir])
      depth += dive.depth
      breadth += dive.breadth
    })
  }

  return { depth, breadth }
}

async function processDir(root: string, dirMap: dirMap, deepCapture: string[] = []): Promise<Build[]> {
  const rel = relative(root, dirMap.absolute)
  // Check for manifests
  for (let i = 0; i < dirMap.manifests.length; i++) {
    const detectors = manifests[dirMap.manifests[i]]
    if (detectors) {
      let needsUpdate = false
      const data = JSON.parse(await readFile(join(dirMap.absolute, dirMap.manifests[i]), { encoding: 'utf8' }))
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
          conf[result.use] = result.config


          options[result.use] = 
            (locale[localeKey] && locale[localeKey].many)
            || `This is a ${localeKey} project`
        }
      }

      options.destructure = locale.destructure.many
      options.ignore = `${dirMap.manifests[i]} is not relevant`

      const use = await choose(`What is in .${sep}${rel}?`, options)
      const builds = [{
        use,
        config: conf[use],
        src: `${rel ? `${rel.replace('\\', '/')}/` : ''}${dirMap.manifests[i]}`
      }]

      if (data.dependencies && devCommand[builds[0].use]) {
        data.scripts['now-dev'] = devCommand[builds[0].use]
        needsUpdate = true
      }
      if (data.dependencies && !data.scripts['now-build']) {
        data.scripts['now-build'] = buildCommand[builds[0].use] ? buildCommand[builds[0].use] : 'npm run build'
        needsUpdate = true
      }
      if (needsUpdate) outputFile(dirMap.absolute, dirMap.manifests[i], JSON.stringify(data, null, 2), true)

      if (builds[0].use === 'destructure') break
      if (builds[0].use === 'ignore') continue

      return builds
    }
  }

  // Check extension groups
  const builds: Build[] = []
  const capture: string[] = []
  for (let ext in dirMap.extensions) {
    if (Object.prototype.hasOwnProperty.call(dirMap.extensions, ext) && !deepCapture.includes(ext)) {
      const { depth, breadth } = getDepthandBreadth(ext, dirMap)
      let use
      let src

      if (depth > 1) {
        use = await choose(
          `What are the ${breadth} ${ext} files in .${sep}${rel} (${depth} deep)?`,
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

  // Check directories
  for (let dir in dirMap.dir) {
    if (Object.prototype.hasOwnProperty.call(dirMap.dir, dir)) {
      builds.push(...await processDir(root, dirMap.dir[dir], capture.concat(deepCapture)))
    }
  }

  return builds
}

function outputFile(dir: string, name: string, contents: string, overwrite: boolean = false): Promise<boolean> {
  return new Promise((resolve) => {
    const file = new Uint8Array(Buffer.from(contents))
    const flag = overwrite ? 'w' : 'wx'
    fs.writeFile(join(dir, name), file, { flag, encoding: 'utf8' }, (err) => {
      if (err) {
        if (err.code !== 'EEXIST') throw err
        resolve(false)
      }
      resolve(true)
    })
  })
}

async function generateProject(dir: string, output: Output): Promise<Project> {
  const stopSpinner = wait(`Loooking for code to build...`)
  const ignore: {[key: string]: true} = {}
  const contents = await generateDirMap(dir, ignore)
  stopSpinner()

  const builds = await processDir(dir, contents)
  const project: Project = {
    config: {
      version: 2,
      name: 'experiment',
      builds: builds.filter((val) => !internal.includes(val.use))
    },
    ignore: Object.keys(ignore)
  }

  if (await outputFile(dir, 'now.json', JSON.stringify(project.config, null, 2))) {
    output.log('A now.json was generated automatically with the following builders:')
    project.config.builds.forEach((build) => output.log(`${build.use} at ${build.src}`))
  }

  if (await outputFile(dir, '.nowignore', project.ignore.join('\n'))) {
    output.log('A .nowignore was generated automatically with the following rules:')
    project.ignore.forEach((e) => output.log(e))
  } else {
    output.log('A .nowignore already exists')
  }

  return project
}

export default generateProject
