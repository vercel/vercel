import { isValidName } from '../../../src/util/is-valid-name';

const tests = {
  'hello world': true,
  käse: true,
  ねこ: true,
  '/': false,
  '/#': false,
  '//': false,
  '/ねこ': true,
  привет: true,
  'привет#': true,
};

describe('isValidName', () => {
  for (const [value, expected] of Object.entries(tests)) {
    it(`should detect "${value}" as \`${expected}\``, () => {
      expect(isValidName(value)).toEqual(expected);
    });
  }
});
