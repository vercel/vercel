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
const parseDeployments = require('./helpers/deployments')

const binary = {
  darwin: 'now-macos',
  linux: 'now-linux',
  win32: 'now-win.exe'
}[process.platform]

const binaryPath = path.resolve(__dirname, '../packed/' + binary)
const fixture = name => path.join(__dirname, 'fixtures', 'integration', name)
const deployHelpMessage = `${logo} now [options] <command | path>`
const session = Math.random().toString(36).split('.')[1]

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
  const deployments = parseDeployments(stdout)

  t.true(deployments.length > 0)

  const target = deployments.find(deployment => {
    return deployment.includes(`${session}-`)
  })

  if (!target) {
    t.fail('Deployment not found')
  }

  t.pass('Found it')
})

test('clean up deployments', async t => {
  const { stdout } = await execa(binaryPath, [ 'ls' ])
  const deployments = parseDeployments(stdout)

  if (deployments.length === 0) {
    t.pass()
    return
  }

  let removers = []

  for (const deployment of deployments) {
    removers.push(execa(binaryPath, [ 'rm', deployment, '--yes' ]))
  }

  await Promise.all(removers)

  const output = await execa(binaryPath, [ 'ls' ])
  const list = parseDeployments(output.stdout)

  t.is(list.length, 0)
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
