import _glob from 'glob'
import path from 'path'
import fs from 'fs-extra'
import execa from 'execa'
import {promisify} from 'util'
import plural from 'pluralize'
import npa from 'npm-package-arg'
import { detectBuilders, Builder, FileFsRef } from '@now/build-utils'
import { NowContext } from '../../types'
import createOutput, { Output } from '../../util/output'
import { getAllProjectFiles } from '../../util/get-files'
import { getYarnPath } from '../../util/dev/yarn-installer'
import runBuild from './run-build';

const glob = promisify(_glob)

const cwd = process.cwd()
const outputDir = path.join(cwd, '.now')
const workDir = path.join(outputDir, 'workDir')
const buildersDir = path.join(outputDir, '/builders')
const buildsOutputDir = path.join(outputDir, 'builds')

let output: Output

async function getBuilds (files: string[]): Promise<Builder[] | null> {
  let nowJson
  let builds

  try {
    nowJson = await fs.readJson(path.join(cwd, 'now.json'))
    builds = nowJson.builds
  } catch (err) {
    output.debug('No now.json found, assuming zero-config')
  }

  // if no builds defined, should be zero-config
  if (!Array.isArray(builds) || builds.length === 0) {
    let pkg
    try {
      pkg = await fs.readJson(path.join(cwd, 'package.json'))
    } catch (err) {
      output.debug('No package.json found')
    }
    builds = (await detectBuilders(files, pkg)).builders
  }

  return builds
}

export default async function main(ctx: NowContext) {
  const debug = ctx.argv.some(arg => arg === '-d' || arg === '--debug')
  const onlyArgIdx = ctx.argv.indexOf('--only')
  const onlyBuild = onlyArgIdx !== -1 && ctx.argv[ctx.argv.indexOf('--only') + 1]

  output = createOutput({ debug })
  output.log('Setting up builds...')

  const files = (await getAllProjectFiles(cwd, output))
    .concat(
      // getAllProjectFiles doesn't include dotfiles (.babelrc) so grab those
      (await glob('**/.*', { cwd, nodir: true }))
        .map(f => f.replace(/\\/g, '/'))
    )
    .filter(file => {
      return !file.startsWith('node_modules') && !file.startsWith('.now')
    })

  const fileRefs: { [filePath: string]: FileFsRef } = {};

  for (const fsPath of files) {
    const relPath = path.relative(cwd, fsPath);
    const { mode } = await fs.stat(fsPath);
    fileRefs[relPath] = new FileFsRef({ mode, fsPath });
  }
  let builds = await getBuilds(files)

  if (builds && onlyBuild) {
    output.debug(`Filtering by src: ${onlyBuild}`)
    builds = builds.filter(build => build.src === onlyBuild)
  }
  if (!builds || builds.length === 0) {
    return output.warn('No builds found')
  }
  output.log(`Found ${builds.length} ${plural('build', builds.length)}`)
  output.debug(`builds: ${JSON.stringify(builds)}`)

  await fs.ensureDir(buildersDir)
  const builders = [...new Set(builds.map(build => build.use))]

  const buildersPkg = {
    name: 'builders',
    dependencies: {} as { [name: string]: string }
  }

  for (const builder of builders) {
    const info = npa(builder)
    buildersPkg.dependencies[info.name || ''] = info.fetchSpec || 'latest'
  }

  await fs.writeFile(
    path.join(buildersDir, 'package.json'),
    JSON.stringify(buildersPkg),
    'utf8'
  )
  const yarnDir = await getYarnPath(output)
  const yarnPath = path.join(yarnDir, 'yarn')

  output.log('Installing builders')

  await execa(
    process.execPath,
    [
      yarnPath,
      'install'
    ],
    {
      cwd: buildersDir,
      stdio: 'inherit'
    }
  )

  await fs.ensureDir(workDir)
  await fs.ensureDir(buildsOutputDir)

  const filesToPersist = new Set([
    'node_modules', 'package.json', 'yarn.lock', 'package-log.json'
  ])

  // Run the builds
  for (const build of builds) {
    for (const file of await fs.readdir(workDir)) {
      if (filesToPersist.has(file)) continue
      await fs.remove(path.join(workDir, file))
    }

    await runBuild({
      output,
      workDir,
      buildersDir,
      buildsOutputDir,
      build,
      files: fileRefs,
    })
  }
}
