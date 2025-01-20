const path = require('path');
const { deployAndTest } = require('../../utils');

describe(`${__dirname.split(path.sep).pop()}`, () => {
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('should deploy and pass probe checks', async () => {
    await deployAndTest(__dirname);
  });
});
