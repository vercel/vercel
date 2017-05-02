const path = require('path')
const crossSpawn = require('cross-spawn')
const test = require('ava')

const logo = require('../lib/utils/output/logo')

test.serial('make binary', async t => {
  if (!process.env.CI) {
    t.true(true)
    return
  }
  const result = await spawn('npm', ['run', 'pack'])
  t.is(result.code, 0)
})

const binary = {
  darwin: 'now-macos',
  linux: 'now-linux',
  win32: 'now-win.exe'
}[process.platform]

const binaryPath = path.resolve(__dirname, '../packed/' + binary)
const deployHelpMessage = `${logo} now [options] <command | path>`

test.serial('packed "now help" prints deploy help message', async t => {
  if (!process.env.CI) {
    t.true(true)
    return
  }
  const result = await spawn(binaryPath, ['help'])

  t.is(result.code, 0)
  const stdout = result.stdout.split('\n')
  t.true(stdout.length > 1)
  t.true(stdout[1].includes(deployHelpMessage))
})

function spawn(command, args) {
  return new Promise((resolve, reject) => {
    const child = crossSpawn.spawn(command, args)

    let stdout = ''
    child.stdout.on('data', data => {
      stdout += data
    })

    child.on('error', err => {
      reject(err)
    })

    child.on('close', code => {
      resolve({
        code,
        stdout
      })
    })
  })
}
