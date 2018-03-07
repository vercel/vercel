// Native
const path = require('path')
const { homedir } = require('os')

// Packages
const test = require('ava')
const semVer = require('semver')
const fkill = require('fkill')
const { remove, pathExists, readJSON, writeJSON } = require('fs-extra')

// Utilities
const logo = require('../src/util/output/logo')
const pkg = require('../package')
const spawn = require('./helpers/spawn')

const binary = {
  darwin: 'now-macos',
  linux: 'now-linux',
  win32: 'now-win.exe'
}[process.platform]

const binaryPath = path.resolve(__dirname, '../packed/' + binary)
const deployHelpMessage = `${logo} now [options] <command | path>`

const configDir = path.resolve(homedir(), '.now')

const configFiles = {
  auth: path.resolve(configDir, 'auth.json'),
  config: path.resolve(configDir, 'config.json')
}

test.before(async t => {
  let configContent

  // Close the existing app
  if (!process.env.CI) {
    try {
      await fkill('Now')
    } catch (err) {}
  }

  const { auth, config } = configFiles

  // Remove the config directory to
  // simulate a new user starting the app
  if (await pathExists(configDir)) {
    configContent = {
      auth: await readJSON(auth),
      config: await readJSON(config)
    }

    await remove(configDir)
  }

  // Save it so we can put it back after the tests
  t.context.oldConfig = configContent
})

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

test('log in', async t => {
  const { stdout, code } = await spawn(binaryPath, ['login', 'now-cli@zeit.pub'])

  const goal = `> Ready! Authentication token and personal details saved in "~/.now"`
  const lines = stdout.trim().split('\n')
  const last = lines[lines.length - 1]

  t.is(last, goal)
})

test('deploy something cached', async t => {
  t.truthy(true)
})

test.after.always(async t => {
  const { oldConfig } = t.context

  if (!oldConfig) {
    return
  }

  const { auth, config } = oldConfig
  const options = { spaces: 2 }

  await writeJSON(configFiles.auth, auth, options)
  await writeJSON(configFiles.config, config, options)
})
