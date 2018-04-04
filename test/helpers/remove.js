// Packages
const execa = require('execa')

module.exports = async (t, binaryPath, defaultArgs, deployment) => {
  const host = deployment.replace('https://', '')

  const { stdout, code } = await execa(binaryPath, [
    'rm',
    deployment,
    '--yes',
    ...defaultArgs
  ], {
    reject: false
  })

  t.truthy(stdout)
  t.is(code, 0)
  t.true(stdout.includes(host))
}
