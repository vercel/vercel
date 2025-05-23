const path = require('path');
const { deployAndTest } = require('../../../utils');

describe(`39-static-asset-404-${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    await deployAndTest(__dirname);
  });
});
