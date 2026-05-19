const path = require('path');
const { deployAndTest } = require('../../utils');

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  // https://linear.app/vercel/issue/ZERO-3238/unskip-tests-failing-due-to-node-16-removal
    it.skip('should deploy and pass probe checks', async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });
});
