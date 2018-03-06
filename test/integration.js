// Native
const path = require('path')

// Packages
const crossSpawn = require('cross-spawn')
const test = require('ava')
const semVer = require('semver')

// Utilities
const logo = require('../src/util/output/logo')
const pkg = require('../package')

const binary = {
  darwin: 'now-macos',
  linux: 'now-linux',
  win32: 'now-win.exe'
}[process.platform]

const binaryPath = path.resolve(__dirname, '../packed/' + binary)
const deployHelpMessage = `${logo} now [options] <command | path>`

test('print the deploy help message', async t => {
  const { stdout, code } = await spawn(binaryPath, ['help'])

  t.is(code, 0)
  t.true(stdout.includes(deployHelpMessage))
})

test('output the version', async t => {
  const { stdout, code } = await spawn(binaryPath, ['--version'])
  const version = stdout.trim()

  t.is(code, 0)
  t.truthy(semVer.valid(version))
  t.is(version, pkg.version)
})

const spawn = (command, args) => new Promise((resolve, reject) => {
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
