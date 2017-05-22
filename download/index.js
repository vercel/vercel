// Native
import fs from 'fs'
import path from 'path'

// Packages
import fetch from 'node-fetch'

// Utilities
import plusxSync from './chmod'
import { disableProgress, enableProgress, info, showProgress } from './log'

const now = path.join(__dirname, 'now')
const targetWin32 = path.join(__dirname, 'now.exe')
const target = process.platform === 'win32' ? targetWin32 : now
const partial = target + '.partial'

const platformToName = {
  darwin: 'now-macos',
  linux: 'now-linux',
  win32: 'now-win.exe'
}

const getLatest = async () => {
  const res = await fetch('https://now-cli-latest.zeit.sh')

  if (res.status !== 200) {
    throw new Error(res.statusText)
  }

  return res.json()
}

async function main() {
  info('Retrieving the latest CLI version...')

  const latest = await getLatest()
  const name = platformToName[process.platform]
  const asset = latest.assets.filter(a => a.name === name)[0]

  info('For the sources, check out: https://github.com/zeit/now-cli')

  // Print an empty line
  console.log('')

  enableProgress('Downloading now CLI ' + latest.tag)
  showProgress(0)

  const { url } = asset
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

  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(2)
})
