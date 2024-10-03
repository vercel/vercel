const path = require('path');
const { deployAndTest } = require('../../utils');

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it.skip('should deploy and pass probe checks', async () => {
    await deployAndTest(__dirname);
  });
});
