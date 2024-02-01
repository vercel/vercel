import { getPackageJSON } from '../../src/index';
import fs from 'fs';
import path from 'path';

test('getPackageJSON caches read operations', () => {
  const expected = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')
  );
  expect(expected.name).toBe('@vercel-internals/get-package-json');

  const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');

  const actual = getPackageJSON();
  expect(actual).toStrictEqual(expected);
  expect(readFileSyncSpy).toBeCalledTimes(1);

  const cacheHit = getPackageJSON();
  expect(cacheHit).toStrictEqual(expected);
  expect(readFileSyncSpy).toBeCalledTimes(1);
});
