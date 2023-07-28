import { existsSync } from 'fs';
import { getExamples } from '../test-utils';

describe('should have test for each example', () => {
  it.each(getExamples())('should exist $exampleName', async ({testPath}) => {
    expect(existsSync(testPath)).toBeTruthy();
  });
});
