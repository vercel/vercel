/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    await deployAndTest(__dirname, { skipForceNew: true });
    const info = Object.assign(ctx, info);
  });
});
