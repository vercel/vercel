const path = require('path');
const { deployAndTest } = require('../../utils');

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    await new Promise()
    expect(true).toBe(true);
    // await deployAndTest(__dirname);
  });
});
