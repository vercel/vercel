/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');

describe(`${__dirname.split(path.sep).pop()}`, () => {
  const ctx = {};

  // https://linear.app/vercel/issue/ZERO-3238/unskip-tests-failing-due-to-node-16-removal
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('should deploy and pass probe checks', async () => {
    const res = await deployAndTest(__dirname);
    Object.assign(ctx, res);
  });
});
