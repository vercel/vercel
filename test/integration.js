// Native
const path = require('path')
const { homedir } = require('os')
const { URL } = require('url')

// Packages
const test = require('ava')
const semVer = require('semver')
const fkill = require('fkill')
const { remove, pathExists, readJSON, writeJSON, readFile } = require('fs-extra')
const execa = require('execa')
const fetch = require('node-fetch')

// Utilities
const logo = require('../src/util/output/logo')
const pkg = require('../package')
const parseList = require('./helpers/parse-list')

// It's EXTREMELY important that this file is
// not run with `--fail-fast`, otherwise the cleanups
// are not happening and we get stuck with
// a lot of errors about too many instances.

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

test.before(async () => {
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
  const target = fixture('node')
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
  const target = fixture('node')

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
  t.is(content.type, 'node')
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
  t.is(content.type, 'node')

  context.alias = hosts.alias
})

test('list the aliases', async t => {
  const { stdout } = await execa(binaryPath, [
    'alias',
    'ls'
  ])

  const results = parseList(stdout)
  t.true(results.includes(context.deployment))
})

test('scale the alias', async t => {
  const goal = `${context.deployment} (1 current)`

  const { stdout } = await execa(binaryPath, [
    'scale',
    context.alias,
    '1'
  ])

  t.true(stdout.includes(goal))
  t.true(stdout.includes(`auto ✖`))
})

test('remove the alias', async t => {
  const goal = `> Success! Alias ${context.alias} removed`

  const { stdout } = await execa(binaryPath, [
    'alias',
    'rm',
    context.alias,
    '--yes'
  ])

  t.true(stdout.startsWith(goal))
})

test('find deployment in scaling list', async t => {
  const { stdout } = await execa(binaryPath, [
    'scale',
    'ls'
  ])

  const list = parseList(stdout)
  t.true(list.includes(context.deployment))
})

test('error on trying to auto-scale', async t => {
  const goal = `> Error! Autoscaling requires pro or max plan`

  const output = await execa.stderr(binaryPath, [
    'scale',
    context.deployment,
    '1',
    'auto'
  ])

  t.is(output, goal)
})

test('scale down the deployment directly', async t => {
  const goals = {
    first: `${context.deployment} (1 current)`,
    second: `> Scaled to 0 instances`
  }

  const { stdout } = await execa(binaryPath, [
    'scale',
    context.deployment,
    '0'
  ])

  t.true(stdout.includes(goals.first))
  t.true(stdout.includes(goals.second))
})

test('deploy multiple static files', async t => {
  const directory = fixture('static-multiple-files')

  const files = [
    path.join(directory, 'logo-black.png'),
    path.join(directory, 'logo-white.png')
  ]

  const { stdout, code } = await execa(binaryPath, [
    files[0],
    files[1],
    '--public',
    `--name ${session}`
  ])

  // Ensure the exit code is right
  t.is(code, 0)

  // Test if the output is really a URL
  const { href, host } = new URL(stdout)
  t.is(host.split('-')[0], session)

  // Send a test request to the deployment
  const response = await fetch(href, {
    headers: {
      'Accept': 'application/json'
    }
  })

  const contentType = response.headers.get('content-type')
  t.is(contentType, 'application/json; charset=utf8')

  const content = await response.json()
  t.is(content.length, 2)

  const bareGoal = files.map(file => path.basename(file))
  const bareCurrent = content.map(item => item.file)

  t.deepEqual(bareGoal, bareCurrent)
})

test('deploy single static file', async t => {
  const file = fixture('static-single-file/logo.png')

  const { stdout, code } = await execa(binaryPath, [
    file,
    '--public',
    `--name ${session}`
  ])

  // Ensure the exit code is right
  t.is(code, 0)

  // Test if the output is really a URL
  const { href, host } = new URL(stdout)
  t.is(host.split('-')[0], session)

  // Send a test request to the deployment
  const response = await fetch(href, {
    headers: {
      'Accept': 'application/json'
    }
  })

  const contentType = response.headers.get('content-type')

  t.is(contentType, 'image/png')
  t.deepEqual(await readFile(file), await response.buffer())
})

test('deploy a dockerfile project', async t => {
  const target = fixture('dockerfile')

  const { stdout, code } = await execa(binaryPath, [
    target,
    '--public',
    `--name ${session}`,
    '--docker'
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
  t.is(content.type, 'docker')
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

test.after.always(async () => {
  const { oldConfig } = context

  if (!oldConfig) {
    return
  }

  const { auth, config } = oldConfig
  const options = { spaces: 2 }

  await writeJSON(configFiles.auth, auth, options)
  await writeJSON(configFiles.config, config, options)
})
