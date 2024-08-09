/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    const info = await deployAndTest(__dirname, { skipForceNew: true });
    Object.assign(ctx, info);
  });
});
