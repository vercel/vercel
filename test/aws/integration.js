// Native
const path = require('path')
const { homedir } = require('os')

// Packages
const test = require('ava')
const execa = require('execa')
const { ensureDir, writeJson } = require('fs-extra')
const tmp = require('tmp-promise')

const binary = {
  darwin: 'now-macos',
  linux: 'now-linux',
  win32: 'now-win.exe'
}[process.platform]

const binaryPath = path.resolve(__dirname, '../../packed/' + binary)
const defaultArgs = ['aws']
let globalConfigDir

if (!process.env.CI) {
  const tmpDir = tmp.dirSync({
    // This ensures the directory gets
    // deleted even if it has contents
    unsafeCleanup: true
  })
  globalConfigDir = path.join(tmpDir.name, '.now')
} else {
  globalConfigDir = path.join(homedir(), '.now')
}

defaultArgs.push('-Q', globalConfigDir)
const authConfigPath = path.join(globalConfigDir, 'auth.json')

test.before(() => ensureDir(globalConfigDir))

test('deploying without credentials', async t => {
  await writeJson(authConfigPath, {
    credentials: [{ provider: 'sh' , token: 'sh-test-token'}]
  })

  const goal = `> Error! No existing credentials found`

  const { code, stderr } = await execa(binaryPath, [
    ...defaultArgs
  ], {
    reject: false
  })

  t.is(code, 1)
  t.true(stderr.includes(goal))
})
