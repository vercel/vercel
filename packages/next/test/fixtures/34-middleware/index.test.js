const path = require('path');
const { deployAndTest } = require('../../utils');

const fixturePath = path.resolve('test/integration/middleware');

// TODO: remove after middleware deploy time is fixed
jest.setTimeout(360000);

describe.skip(`${__dirname.split(path.sep).pop()}`, () => {
  it.skip('should deploy and pass probe checks', async () => {
    // TODO: add probe checks
    await deployAndTest(fixturePath);
  });
});
