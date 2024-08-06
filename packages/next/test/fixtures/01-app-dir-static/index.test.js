/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    const info = await require('../../utils').normalizeReactVersion(__dirname);
    await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });
});
