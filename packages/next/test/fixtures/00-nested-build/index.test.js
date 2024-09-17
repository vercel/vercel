const path = require('path');
const { deployAndTest } = require('../../utils');

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    await require('../../utils').normalizeReactVersion(path.join(__dirname, 'website'));
    await require('../../utils').normalizeReactVersion(path.join(__dirname, 'website/website-preview'));
    await deployAndTest(__dirname);
  });
});
