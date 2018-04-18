// Native
const path = require('path')
const { homedir } = require('os')
const { URL } = require('url')

// Packages
const test = require('ava')
const semVer = require('semver')
const { readFile } = require('fs-extra')
const execa = require('execa')
const fetch = require('node-fetch')
const tmp = require('tmp-promise')

// Utilities
const logo = require('../src/util/output/logo')
const pkg = require('../package')
const parseList = require('./helpers/parse-list')
const removeDeployment = require('./helpers/remove')
const prepareFixtures = require('./helpers/prepare')

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

const defaultArgs = []
let tmpDir

if (!process.env.CI) {
  tmpDir = tmp.dirSync({
    // This ensures the directory gets
    // deleted even if it has contents
    unsafeCleanup: true
  })

  defaultArgs.push('-Q', path.join(tmpDir.name, '.now'))
}

test.before(async () => prepareFixtures(session))

test('print the deploy help message', async t => {
  const { stdout, code } = await execa(binaryPath, [
    'help',
    ...defaultArgs
  ], {
    reject: false
  })

  t.is(code, 0)
  t.true(stdout.includes(deployHelpMessage))
})

test('output the version', async t => {
  const { stdout, code } = await execa(binaryPath, [
    '--version',
    ...defaultArgs
  ], {
    reject: false
  })

  const version = stdout.trim()

  t.is(code, 0)
  t.truthy(semVer.valid(version))
  t.is(version, pkg.version)
})

test('log in', async t => {
  const { stdout, code } = await execa(binaryPath, [
    'login',
    `now-cli-${session}@zeit.pub`,
    ...defaultArgs
  ], {
    reject: false
  })

  const location = path.join(tmpDir ? tmpDir.name : '~', '.now')
  const goal = `> Ready! Authentication token and personal details saved in "${location}"`
  const lines = stdout.trim().split('\n')
  const last = lines[lines.length - 1]

  t.is(code, 0)
  t.is(last, goal)
})

test('trigger OSS confirmation message', async t => {
  const target = fixture('node')
  const goal = `Your deployment's code and logs will be publicly accessible`

  const { stderr, code } = await execa(binaryPath, [
    target,
    ...defaultArgs
  ], {
    reject: false
  })

  t.is(code, 1)
  t.true(stderr.includes(goal))
})

test('try to deploy user directory', async t => {
  const goal = `> Error! You're trying to deploy your user directory`

  const { stderr, code } = await execa(binaryPath, defaultArgs, {
    reject: false,
    cwd: homedir()
  })

  t.is(code, 1)
  t.true(stderr.includes(goal))
})

test('deploy a node microservice', async t => {
  const target = fixture('node')

  const { stdout, code } = await execa(binaryPath, [
    target,
    '--public',
    '--name',
    session,
    ...defaultArgs
  ], {
    reject: false
  })

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
  t.is(content.id, session)
})

test('find deployment in list', async t => {
  const { stdout, code } = await execa(binaryPath, [
    'ls',
    ...defaultArgs
  ], {
    reject: false
  })

  const deployments = parseList(stdout)

  t.true(deployments.length > 0)
  t.is(code, 0)

  const target = deployments.find(deployment => {
    return deployment.includes(`${session}-`)
  })

  t.truthy(target)

  if (target) {
    context.deployment = target
  }
})

test('find deployment in list with mixed args', async t => {
  const { stdout, code } = await execa(binaryPath, [
    '--debug',
    'ls',
    ...defaultArgs
  ], {
    reject: false
  })

  const deployments = parseList(stdout)

  t.true(deployments.length > 0)
  t.is(code, 0)

  const target = deployments.find(deployment => {
    return deployment.includes(`${session}-`)
  })

  t.truthy(target)

  if (target) {
    context.deployment = target
  }
})

test('create alias for deployment', async t => {
  const hosts = {
    deployment: context.deployment,
    alias: `${session}.now.sh`
  }

  const { stdout, code } = await execa(binaryPath, [
    'alias',
    hosts.deployment,
    hosts.alias,
    ...defaultArgs
  ], {
    reject: false
  })

  const goal = `> Success! ${hosts.alias} now points to ${hosts.deployment}!`

  t.is(code, 0)
  t.true(stdout.startsWith(goal))

  // Send a test request to the alias
  const response = await fetch(`https://${hosts.alias}`)
  const contentType = response.headers.get('content-type')
  const content = await response.json()

  t.is(contentType, 'application/json; charset=utf-8')
  t.is(content.id, session)

  context.alias = hosts.alias
})

test('list the aliases', async t => {
  const { stdout, code } = await execa(binaryPath, [
    'alias',
    'ls',
    ...defaultArgs
  ], {
    reject: false
  })

  const results = parseList(stdout)

  t.is(code, 0)
  t.true(results.includes(context.deployment))
})

test('scale the alias', async t => {
  const { stdout, code } = await execa(binaryPath, [
    'scale',
    context.alias,
    '1',
    ...defaultArgs
  ], {
    reject: false
  })

  t.is(code, 0)
  t.true(stdout.includes(`(min: 1, max: 1)`))
})

test('remove the alias', async t => {
  const goal = `> Success! Alias ${context.alias} removed`

  const { stdout, code } = await execa(binaryPath, [
    'alias',
    'rm',
    context.alias,
    '--yes',
    ...defaultArgs
  ], {
    reject: false
  })

  t.is(code, 0)
  t.true(stdout.startsWith(goal))
})

test('scale down the deployment directly', async t => {
  const { stdout, code } = await execa(binaryPath, [
    'scale',
    context.deployment,
    '0',
    ...defaultArgs
  ], {
    reject: false
  })

  t.is(code, 0)
  t.true(stdout.includes(`(min: 0, max: 0)`))

  await removeDeployment(t, binaryPath, defaultArgs, context.deployment)
})

test('deploy multiple static files', async t => {
  const directory = fixture('static-multiple-files')

  const files = [
    path.join(directory, 'first.png'),
    path.join(directory, 'second.png')
  ]

  const { stdout, code } = await execa(binaryPath, [
    files[0],
    files[1],
    '--public',
    '--name',
    session,
    ...defaultArgs
  ], {
    reject: false
  })

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
  await removeDeployment(t, binaryPath, defaultArgs, stdout)
})

test('deploy single static file', async t => {
  const file = fixture('static-single-file/first.png')

  const { stdout, code } = await execa(binaryPath, [
    file,
    '--public',
    '--name',
    session,
    ...defaultArgs
  ], {
    reject: false
  })

  // Ensure the exit code is right
  t.is(code, 0)

  // Test if the output is really a URL
  const { href, host } = new URL(stdout)
  t.is(host.split('-')[0], session)

  // Send a test request to the deployment
  const response = await fetch(href)
  const contentType = response.headers.get('content-type')

  t.is(contentType, 'image/png')
  t.deepEqual(await readFile(file), await response.buffer())

  await removeDeployment(t, binaryPath, defaultArgs, stdout)
})

test('deploy a static directory', async t => {
  const directory = fixture('static-single-file')

  const { stdout, code } = await execa(binaryPath, [
    directory,
    '--public',
    '--name',
    session,
    ...defaultArgs
  ], {
    reject: false
  })

  // Ensure the exit code is right
  t.is(code, 0)

  // Test if the output is really a URL
  const { href, host } = new URL(stdout)
  t.is(host.split('-')[0], session)

  // Send a test request to the deployment
  const response = await fetch(href)
  const contentType = response.headers.get('content-type')
  const file = path.join(directory, 'first.png')

  t.is(contentType, 'image/png')
  t.deepEqual(await readFile(file), await response.buffer())

  await removeDeployment(t, binaryPath, defaultArgs, stdout)
})

test('deploy a dockerfile project', async t => {
  const target = fixture('dockerfile')

  const { stdout, code } = await execa(binaryPath, [
    target,
    '--public',
    '--name',
    session,
    '--docker',
    '--no-verify',
    ...defaultArgs
  ], {
    reject: false
  })

  // Ensure the exit code is right
  t.is(code, 0)

  // Test if the output is really a URL
  const { href, host } = new URL(stdout)
  t.is(host.split('-')[0], session)

  // Send a test request to the deployment
  const response = await fetch(href)
  const contentType = response.headers.get('content-type')
  const textContent = await response.text()
  let content

  try {
    content = JSON.parse(textContent)
  } catch (error) {
    console.log('Error parsing response as JSON:')
    console.error(textContent)
    throw error
  }

  t.is(contentType, 'application/json; charset=utf-8')
  t.is(content.id, session)

  await removeDeployment(t, binaryPath, defaultArgs, stdout)
})

test('try to deploy non-existing path', async t => {
  const goal = `> Error! The specified directory "${session}" doesn't exist.`

  const { stderr, code } = await execa(binaryPath, [
    session,
    ...defaultArgs
  ], {
    reject: false
  })

  t.is(code, 1)
  t.true(stderr.trim().endsWith(goal))
})

test('try to deploy with non-existing team', async t => {
  const target = fixture('node')
  const goal = `> Error! The specified team doesn't exist`

  const { stderr, code } = await execa(binaryPath, [
    target,
    '--team',
    session,
    ...defaultArgs
  ], {
    reject: false
  })

  t.is(code, 1)
  t.true(stderr.startsWith(goal))
})

test.after.always(async t => {
  const { stdout, code } = await execa(binaryPath, [
    'ls',
    session,
    ...defaultArgs
  ], {
    reject: false
  })

  t.is(code, 0)

  const deployments = parseList(stdout)
  const removers = []

  for (const deployment of deployments) {
    removers.push(removeDeployment(t, binaryPath, defaultArgs, deployment))
  }

  await Promise.all(removers)
})

test.after.always(async () => {
  // Make sure the token gets revoked
  await execa(binaryPath, [
    'logout',
    ...defaultArgs
  ])

  if (!tmpDir) {
    return
  }

  // Remove config directory entirely
  tmpDir.removeCallback()
})
