import { relative } from 'path'
import wait from '../output/wait'
import { Output } from '../output'
import { detectFromManifests } from './detect-from-manifests';
import { outputFile, choose } from './helpers'
import { internal } from './metadata'
import { DirMap, generateDirMap } from './generate-dir-map'
import { detectFromExtensions } from './detect-from-extensions';

export type Build = { src: string, use: string }
type nowJson = {
  version: number,
  name?: string,
  builds: Array<Build>
}
type Project = { config: nowJson, ignore: string[] }

async function processDir(root: string, map: DirMap, deepCapture: string[] = []): Promise<Build[]> {
  const rel = relative(root, map.absolute)
  
  const manifestBuilds = await detectFromManifests(map.manifests, map.absolute, rel, { choose, outputFile })
  if (manifestBuilds) return manifestBuilds

  // Check extension groups
  const { builds, capture } = await detectFromExtensions(map, deepCapture, rel, { choose })

  // Check directories
  for (let name in map.dir) {
    if (Object.prototype.hasOwnProperty.call(map.dir, name)) {
      builds.push(...await processDir(root, map.dir[name], capture.concat(deepCapture)))
    }
  }

  return builds
}

export async function generateProject(dir: string, output: Output): Promise<Project> {
  const stopSpinner = wait(`Loooking for code to build...`)
  const ignore: {[key: string]: true} = {}
  const contents = await generateDirMap(dir, ignore)
  stopSpinner()

  const builds = await processDir(dir, contents)
  const project: Project = {
    config: {
      version: 2,
      name: 'experiment',
      builds: builds.filter((val) => !Object.keys(internal).includes(val.use))
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
