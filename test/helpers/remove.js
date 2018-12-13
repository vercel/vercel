// Packages
const execa = require('execa');

module.exports = async (t, binaryPath, defaultArgs, deployment) => {
  const host = deployment.replace('https://', '');

  const { stdout, stderr, code } = await execa(binaryPath, [
    'rm',
    host,
    '--yes',
    ...defaultArgs
  ], {
    reject: false
  });

  console.log('stdout')
  console.log(stdout)
  console.log('stderr')
  console.log(stderr)

  t.truthy(stdout);
  t.is(code, 0);
  t.true(stdout.includes(host));
};
