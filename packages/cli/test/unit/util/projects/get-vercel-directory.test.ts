import { basename, join } from 'path';
import { getVercelDirectory } from '../../../../src/util/projects/link';

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit', name);

describe('getVercelDirectory', () => {
  it('should return ".vercel"', () => {
    const cwd = fixture('get-vercel-directory');
    const dir = getVercelDirectory(cwd);
    expect(basename(dir)).toEqual('.vercel');
  });

  it('should return ".now"', () => {
    const cwd = fixture('get-vercel-directory-legacy');
    const dir = getVercelDirectory(cwd);
    expect(basename(dir)).toEqual('.now');
  });

  it('should throw an error if both ".vercel" and ".now" exist', () => {
    let err: Error;
    const cwd = fixture('get-vercel-directory-error');
    try {
      getVercelDirectory(cwd);
      throw new Error('Should not happen');
    } catch (_err) {
      err = _err;
    }
    expect(err.message).toEqual(
      'Both `.vercel` and `.now` directories exist. Please remove the `.now` directory.'
    );
  });
});
