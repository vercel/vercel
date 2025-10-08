/* eslint-env jest */
const path = require('path');
const fs = require('fs-extra');
const { deployAndTest } = require('../../utils');

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  const fixtureDir = path.join(__dirname, 'tmp-contents');

  afterAll(() => fs.remove(fixtureDir));

  it('should deploy and pass probe checks', async () => {
    await fs.copy(path.join(__dirname, '../00-app-dir-no-ppr'), fixtureDir);
    const nextConfigPath = path.join(fixtureDir, 'next.config.js');

    await fs.writeFile(
      nextConfigPath,
      (
        await fs.readFile(nextConfigPath, 'utf8')
      ).replace('experimental:', 'basePath: "/hello/world",experimental:')
    );

    await fs.copy(
      path.join(__dirname, 'vercel.json'),
      path.join(fixtureDir, 'vercel.json')
    );
    
    const info = await deployAndTest(fixtureDir);
    Object.assign(ctx, info);
  });
});
