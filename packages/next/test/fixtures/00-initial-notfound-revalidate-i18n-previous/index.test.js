/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');

describe(`${__dirname.split(path.sep).pop()}`, () => {
  const ctx = {};

  it('should deploy and pass probe checks', async () => {
    const res = await deployAndTest(__dirname);
    Object.assign(ctx, res);
  });
});
