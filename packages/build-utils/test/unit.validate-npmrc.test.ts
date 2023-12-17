import { join } from 'path';
import { validateNpmrc } from '../src/validate-npmrc';

const fixture = (name: string) => join(__dirname, 'fixtures', '29-npmrc', name);

describe('validateNpmrc', () => {
  it('should not error with no use-node-version', async () => {
    await expect(validateNpmrc(fixture('good'))).resolves.toBe(undefined);
  });

  it('should throw when use-node-version is found', async () => {
    await expect(
      validateNpmrc(fixture('has-use-node-version'))
    ).rejects.toThrow('Detected unsupported');
  });

  it('should not error when use-node-version is commented out', async () => {
    await expect(
      validateNpmrc(fixture('comment-use-node-version'))
    ).resolves.toBe(undefined);
  });
});
