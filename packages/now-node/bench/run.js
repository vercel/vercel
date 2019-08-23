const fs = require('fs-extra');
const { join } = require('path');
const { makeLauncher } = require('../dist/launcher');

const setupFiles = async (entrypoint, shouldAddHelpers) => {
  await fs.remove(join(__dirname, 'lambda'));
  await fs.ensureDir(join(__dirname, 'lambda'));

  await fs.copyFile(
    join(__dirname, '../dist/helpers.js'),
    join(__dirname, 'lambda/helpers.js'),
  );
  await fs.copyFile(
    require.resolve('@now/node-bridge/bridge'),
    join(__dirname, 'lambda/bridge.js'),
  );
  await fs.copyFile(
    join(process.cwd(), entrypoint),
    join(__dirname, 'lambda/entrypoint.js'),
  );

  let launcher = makeLauncher('./entrypoint', shouldAddHelpers);
  launcher += '\nexports.bridge=bridge';

  await fs.writeFile(join(__dirname, 'lambda/launcher.js'), launcher);
};

const createBigJSONObj = () => {
  const obj = {};
  for (let i = 0; i < 1000; i += 1) {
    obj[`idx${i}`] = `val${i}`;
  }
};

const createEvent = () => ({
  Action: 'Invoke',
  body: JSON.stringify({
    method: 'POST',
    path: '/',
    headers: { 'content-type': 'application/json' },
    encoding: undefined,
    body: createBigJSONObj(),
  }),
});

const runTests = async (entrypoint, shouldAddHelpers = true, nb) => {
  console.log(
    `setting up files with entrypoint ${entrypoint} and ${
      shouldAddHelpers ? 'helpers' : 'no helpers'
    }`,
  );
  await setupFiles(entrypoint, shouldAddHelpers);

  console.log('importing launcher');
  const launcher = require('./lambda/launcher');

  const event = createEvent();
  const context = {};

  const start = process.hrtime();

  console.log(`throwing ${nb} events at lambda`);
  for (let i = 0; i < nb; i += 1) {
    // eslint-disable-next-line
    await launcher.launcher(event, context);
  }
  const timer = process.hrtime(start);
  const ms = (timer[0] * 1e9 + timer[1]) / 1e6;

  await launcher.bridge.server.close();
  delete require.cache[require.resolve('./lambda/launcher')];

  console.log({ nb, sum: ms, avg: ms / nb });
};

const main = async () => {
  if (process.argv.length !== 5) {
    console.log(
      'usage : node run.js <entrypoint-file> <add-helpers> <nb-of-request>',
    );
    return;
  }

  const [, , entrypoint, helpers, nbRequests] = process.argv;
  const shouldAddHelpers = helpers !== 'false' && helpers !== 'no';
  const nb = Number(nbRequests);

  await runTests(entrypoint, shouldAddHelpers, nb);
};

main();
