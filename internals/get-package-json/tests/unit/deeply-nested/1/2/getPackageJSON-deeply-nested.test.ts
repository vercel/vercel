import { getPackageJSON } from '../../../../../src/index';
import fs from 'fs';
import path from 'path';

test('getPackageJSON should return the package.json', () => {
  const expected = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')
  );
  expect(expected.name).toBe('deeply-nested');
  const actual = getPackageJSON();
  expect(actual).toStrictEqual(expected);
});
