const execa = require('execa');

module.exports = async function ({ deploymentUrl, fetch }) {
  const probeUrl = `https://${deploymentUrl}/api`;
  const result = await execa('curl', [
    probeUrl,
    '-s',
    '-H',
    'foo: bar',
    '-H',
    'foo: bar',
  ]);
  if (result.stdout.includes('FUNCTION_INVOCATION_FAILED')) {
    throw new Error(
      'Duplicate headers should not cause a function invocation failure'
    );
  }
};
