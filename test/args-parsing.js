const path = require('path')
const test = require('ava')
const { spawn } = require('cross-spawn')

const logo = require('../lib/utils/output/logo')

const deployHelpMessage = `${logo} now [options] <command | path>`
const aliasHelpMessage = `${logo} now alias <ls | set | rm> <deployment> <alias>`

test('"now help" prints deploy help message', async t => {
  const result = await now('help')

  t.is(result.code, 0)
  const stdout = result.stdout.split('\n')
  t.true(stdout.length > 1)
  t.true(stdout[1].includes(deployHelpMessage))
})

test('"now --help" prints deploy help message', async t => {
  const result = await now('--help')

  t.is(result.code, 0)
  const stdout = result.stdout.split('\n')
  t.true(stdout.length > 1)
  t.true(stdout[1].includes(deployHelpMessage))
})

test('"now deploy --help" prints deploy help message', async t => {
  const result = await now('deploy', '--help')

  t.is(result.code, 0)
  const stdout = result.stdout.split('\n')
  t.true(stdout.length > 1)
  t.true(stdout[1].includes(deployHelpMessage))
})

test('"now --help deploy" prints deploy help message', async t => {
  const result = await now('--help', 'deploy')

  t.is(result.code, 0)
  const stdout = result.stdout.split('\n')
  t.true(stdout.length > 1)
  t.true(stdout[1].includes(deployHelpMessage))
})

test('"now help alias" prints alias help message', async t => {
  const result = await now('help', 'alias')

  t.is(result.code, 0)
  const stdout = result.stdout.split('\n')
  t.true(stdout.length > 1)
  t.true(stdout[1].includes(aliasHelpMessage))
})

test('"now alias --help" is the same as "now --help alias"', async t => {
  const [result1, result2] = await Promise.all([
    now('alias', '--help'),
    now('--help', 'alias')
  ])

  t.is(result1.code, 0)
  t.is(result1.code, result2.code)
  t.is(result1.stdout, result2.stdout)
})

/**
 * Run the built now binary with given arguments
 *
 * @param  {String} args  string arguements
 * @return {Promise}      promise that resolves to an object {code, stdout}
 */
function now(...args) {
  return new Promise((resolve, reject) => {
    const command = path.resolve(__dirname, '../bin/now.js')
    const now = spawn(command, args)

    let stdout = ''
    now.stdout.on('data', data => {
      stdout += data
    })

    now.on('error', err => {
      reject(err)
    })

    now.on('close', code => {
      resolve({
        code,
        stdout
      })
    })
  })
}
