/* eslint-disable unicorn/no-process-exit */

// Native
import fs from 'fs'
import path from 'path'

// Packages
import onDeath from 'death'
import fetch from 'node-fetch'

// Utilities
import plusxSync from './chmod'
import { disableProgress, enableProgress, info, showProgress } from './log'

const now = path.join(__dirname, 'now')
const targetWin32 = path.join(__dirname, 'now.exe')
const target = process.platform === 'win32' ? targetWin32 : now
const partial = target + '.partial'

const packagePath = path.join(__dirname, '..', '..', 'package.json')
const packageJSON = JSON.parse(fs.readFileSync(packagePath, 'utf8'))

const platformToName = {
  darwin: 'now-macos',
  linux: 'now-linux',
  win32: 'now-win.exe'
}

async function main() {
  fs.writeFileSync(
    now,
    '#!/usr/bin/env node\n' +
      'console.log("Please wait until the \'now\' installation completes!")\n'
  )

  onDeath(() => {
    fs.writeFileSync(
      now,
      '#!/usr/bin/env node\n' +
        'console.log("The \'now\' installation did not complete successfully.")\n' +
        'console.log("Please run \'npm i -g now\' to reinstall!")\n'
    )
    process.exit();
  })

  info('Retrieving the latest CLI version...')

  const downloadURL = `https://api.github.com/repos/zeit/now-cli/releases/tags/${packageJSON.version}`
  const responseLatest = await fetch(downloadURL)
  const latest = await responseLatest.json()

  const name = platformToName[process.platform]
  const asset = latest.assets.find(a => a.name === name)

  info('For the sources, check out: https://github.com/zeit/now-cli')

  // Print an empty line
  console.log('')

  enableProgress('Downloading now CLI ' + packageJSON.version)
  showProgress(0)

  const url = asset.browser_download_url
  const resp = await fetch(url)

  if (resp.status !== 200) {
    disableProgress()
    throw new Error(resp.statusText + ' ' + url)
  }

  const size = resp.headers.get('content-length')
  const ws = fs.createWriteStream(partial)

  await new Promise((resolve, reject) => {
    let bytesRead = 0

    resp.body.on('data', chunk => {
      bytesRead += chunk.length
      showProgress(100 * bytesRead / size)
    })

    resp.body.pipe(ws)

    ws
      .on('close', () => {
        showProgress(100)
        disableProgress()
        resolve()
      })
      .on('error', error => {
        disableProgress()
        reject(error)
      })
  })

  fs.renameSync(partial, target)

  if (process.platform === 'win32') {
    fs.writeFileSync(
      now,
      '#!/usr/bin/env node\n' +
        'var chip = require("child_process")\n' +
        'var args = process.argv.slice(2)\n' +
        'var opts = { stdio: "inherit" }\n' +
        'var r = chip.spawnSync(__dirname + "/now.exe", args, opts)\n' +
        'if (r.error) throw r.error\n' +
        'process.exit(r.status)\n'
    )
  } else {
    plusxSync(now)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(2)
})
