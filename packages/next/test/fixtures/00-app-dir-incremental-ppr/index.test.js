/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');

const ctx = {};

// TODO: investigate invariant 
describe.skip(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });
});
