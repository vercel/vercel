/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    let error = undefined;

    try {
      const info = await deployAndTest(__dirname);
      Object.assign(ctx, info);
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
  });
});
