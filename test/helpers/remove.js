// Packages
const execa = require('execa')

module.exports = async (t, binaryPath, defaultArgs, deployment) => {
  const host = deployment.replace('https://', '')
  const goal = `> Deployment ${host} removed`

  const { stdout } = await execa(binaryPath, [
    'rm',
    deployment,
    '--yes',
    ...defaultArgs
  ])

  t.truthy(stdout)
  t.true(stdout.includes(goal))
}
