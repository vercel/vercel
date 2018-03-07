// Native
const path = require('path')
const { homedir } = require('os')
const { URL } = require('url')

// Packages
const test = require('ava')
const semVer = require('semver')
const fkill = require('fkill')
const { remove, pathExists, readJSON, writeJSON } = require('fs-extra')
const execa = require('execa')
const fetch = require('node-fetch')

// Utilities
const logo = require('../src/util/output/logo')
const pkg = require('../package')
const parseList = require('./helpers/parse-list')

const binary = {
  darwin: 'now-macos',
  linux: 'now-linux',
  win32: 'now-win.exe'
}[process.platform]

const binaryPath = path.resolve(__dirname, '../packed/' + binary)
const fixture = name => path.join(__dirname, 'fixtures', 'integration', name)
const deployHelpMessage = `${logo} now [options] <command | path>`
const session = Math.random().toString(36).split('.')[1]

// AVA's `t.context` can only be set before the tests,
// but we want to set it within as well
const context = {}

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
  context.oldConfig = configContent
})

test('print the deploy help message', async t => {
  const { stdout, code } = await execa(binaryPath, ['help'])

  t.is(code, 0)
  t.true(stdout.includes(deployHelpMessage))
})

test('output the version', async t => {
  const { stdout, code } = await execa(binaryPath, ['--version'])
  const version = stdout.trim()

  t.is(code, 0)
  t.truthy(semVer.valid(version))
  t.is(version, pkg.version)
})

test('log in', async t => {
  const { stdout } = await execa(binaryPath, ['login', 'now-cli@zeit.pub'])

  const goal = `> Ready! Authentication token and personal details saved in "~/.now"`
  const lines = stdout.trim().split('\n')
  const last = lines[lines.length - 1]

  t.is(last, goal)
})

test('trigger OSS confirmation message', async t => {
  const target = fixture('node-micro')
  const goal = `Your deployment's code and logs will be publicly accessible`

  try {
    await execa(binaryPath, [ target ])
  } catch (err) {
    t.true(err.stderr.includes(goal))
    return
  }

  t.fail(`Didn't print to stderr`)
})

test('deploy a node microservice', async t => {
  const target = fixture('node-micro')

  const { stdout, code } = await execa(binaryPath, [
    target,
    '--public',
    `--name ${session}`
  ])

  // Ensure the exit code is right
  t.is(code, 0)

  // Test if the output is really a URL
  const { href, host } = new URL(stdout)
  t.is(host.split('-')[0], session)

  // Send a test request to the deployment
  const response = await fetch(href)
  const contentType = response.headers.get('content-type')
  const content = await response.json()

  t.is(contentType, 'application/json; charset=utf-8')
  t.is(content.hello, 'world')
})

test('find deployment in list', async t => {
  const { stdout } = await execa(binaryPath, [ 'ls' ])
  const deployments = parseList(stdout)

  t.true(deployments.length > 0)

  const target = deployments.find(deployment => {
    return deployment.includes(`${session}-`)
  })

  if (!target) {
    t.fail('Deployment not found')
  }

  t.pass('Found it')
  context.deployment = target
})

test('create alias for deployment', async t => {
  const hosts = {
    deployment: context.deployment,
    alias: `${session}.now.sh`
  }

  const { stdout } = await execa(binaryPath, [
    'alias',
    hosts.deployment,
    hosts.alias
  ])

  const goal = `> Success! ${hosts.alias} now points to ${hosts.deployment}!`
  t.true(stdout.startsWith(goal))

  // Send a test request to the alias
  const response = await fetch(`https://${hosts.alias}`)
  const contentType = response.headers.get('content-type')
  const content = await response.json()

  t.is(contentType, 'application/json; charset=utf-8')
  t.is(content.hello, 'world')

  context.alias = hosts.alias
})

test('list the aliases', async t => {
  const { stdout } = await execa(binaryPath, [
    'alias',
    'ls'
  ])

  const results = parseList(stdout, context.alias)
  t.true(results.includes(context.deployment))
})

test('clean up deployments', async t => {
  const { stdout } = await execa(binaryPath, [ 'rm', session, '--yes' ])
  const goal = new RegExp(`> Deployment ${session}-(.*).now.sh removed`, 'g')

  t.truthy(stdout)
  t.true(goal.test(stdout))
})

test('list deployments and see if they were removed', async t => {
  const secondOutput = await execa(binaryPath, [ 'ls', session ])
  const list = parseList(secondOutput.stdout)

  t.is(list.length, 0)
})

test.after.always(async t => {
  const { oldConfig } = context

  if (!oldConfig) {
    return
  }

  const { auth, config } = oldConfig
  const options = { spaces: 2 }

  await writeJSON(configFiles.auth, auth, options)
  await writeJSON(configFiles.config, config, options)
})
