import { parseGoModVersion } from '../src/go-helpers';

describe('parseGoModVersion', function () {
  it('returns undefined with empty string', async () => {
    const version = parseGoModVersion('');
    expect(version).toBeUndefined();
  });
});
