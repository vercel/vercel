// Native
import path from 'path'
import {spawn} from 'child_process'

// Packages
import fs from 'fs-extra'
import {walk} from 'walk'

export function injectPackage(tmpDir, defaults, flags) {
  const pkgPath = path.join(tmpDir, 'package.json')

  fs.writeJSON(pkgPath, defaults, err => {
    if (err) {
      throw err
    }

    exports.deploy(tmpDir, flags)
  })
}

export function deploy(dir, flags) {
  const oldCwd = process.cwd()
  const cmd = process.platform === 'win32' ? 'now.cmd' : 'now'

  process.chdir(dir)
  const flagsAllowed = typeof flags === 'string'
  const flagList = []

  if (flagsAllowed) {
    let splitted = flags.split(', ')

    for (const item of splitted) {
      if (item.indexOf(',') > -1) {
        splitted = flags.split(',')
        break
      }
    }

    for (const item of splitted) {
      flagList.push(item)
    }
  }

  for (const flag of flagList) {
    const index = flagList.indexOf(flag)
    const prefix = flag.length > 1 ? '--' : '-'

    if (flag === '') {
      flagList.splice(index, 1)
    } else {
      flagList[index] = prefix + flag
    }
  }

  // Run now and deploy
  const now = spawn(cmd, flagList, {
    stdio: 'inherit'
  })

  now.on('error', err => console.error(err))

  now.on('exit', () => {
    process.chdir(oldCwd)
    exports.cleanup(dir)
  })

  process.on('SIGINT', () => {
    now.kill('SIGINT')
    exports.cleanup(dir)
  })
}

export function cleanup(dir) {
  fs.remove(dir, err => {
    if (err) {
      throw err
    }

    process.exit()
  })
}

export function copyContents(content, tmp, defaults, flags) {
  // Ignore packages
  const walker = walk(content, {
    filters: [
      'node_modules'
    ]
  })

  walker.on('file', (root, fileStats, next) => {
    const file = path.join(root, fileStats.name)
    const target = path.join(tmp + '/content', path.relative(content, file))

    // Once a file is found, copy it to the temp directory
    fs.copy(file, target, err => {
      if (err) {
        throw err
      }

      next()
    })
  })

  walker.on('errors', (root, nodeStatsArray, next) => {
    console.error(`Not able to copy file: ${nodeStatsArray}`)
    next()
  })

  walker.on('end', () => exports.injectPackage(tmp, defaults, flags))
}
