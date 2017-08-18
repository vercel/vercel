// Native
const { tmpdir } = require('os')
const { join } = require('path')
const { exec: exec_ } = require('child_process')
const exec = require('util').promisify(exec_)

// Packages
const { mkdir, stat, link, existsSync, readdir } = require('fs-extra-promise')
const uid = require('uid-promise')
const { toBuffer } = require('convert-stream')
const archiver = require('archiver')
const debug = require('debug')('now:serverless:builders:nodejs')

const nodejsBuilder = async (dir, desc, { overrides = {} } = {}) => {
  const files = await readdir(dir)
  const tmpDirName = `now-nodejs-build-${await uid(20)}`
  const targetPath = join(tmpdir(), tmpDirName)

  debug('init nodejs project build stage in', targetPath)
  await mkdir(targetPath)

  // produce hard links of the source files in the target dir
  await Promise.all(
    files
      .filter(name => name !== 'node_modules' && !(name in overrides))
      .map(file => {
        debug('making hard link for %s', file)
        return link(join(dir, file), join(targetPath, file))
      })
  )

  const archive = archiver('zip')

  // trigger an install if needed
  if (desc.packageJSON) {
    let buildCommand = ''

    if (existsSync(join(targetPath, 'package-lock.json'))) {
      buildCommand = 'npm install'
    } else if (existsSync(join(targetPath, 'yarn.lock'))) {
      buildCommand = 'yarn install'
    } else {
      buildCommand = 'npm install'
    }

    try {
      debug('executing %s in %s', buildCommand, targetPath)
      await exec(buildCommand, {
        cwd: targetPath,
        env: Object.assign({}, process.env, {
          // we set this so that we make the installers ignore
          // dev dependencies. in the future, we can add a flag
          // to ignore this behavior, or set different envs
          NODE_ENV: 'production'
        })
      })
    } catch (err) {
      throw new Error(
        `The build command ${buildCommand} failed for ${dir}: ${err.message}`
      )
    }
  } else {
    debug('ignoring build step, no manifests found')
  }

  const buffer = toBuffer(archive)

  archive.on('warning', err => {
    console.error('Warning while creating zip file', err)
  })

  for (const name in overrides) {
    archive.append(overrides[name], { name })
  }

  // we read again to get the results of the build process
  const filesToZip = await readdir(targetPath)
  await Promise.all(
    filesToZip.map(async file => {
      const path = join(targetPath, file)
      const stats = await stat(path)
      debug('adding', path)
      return stats.isDirectory()
        ? archive.directory(path, file, { stats })
        : archive.file(path, { name: file, stats })
    })
  )

  archive.finalize()

  // buffer promise
  return buffer
}

module.exports = nodejsBuilder
