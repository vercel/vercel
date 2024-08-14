import { describe, expect, it } from 'vitest';
import getProjectName from '../../../src/util/get-project-name';

describe('getProjectName', () => {
  it('should work with argv', () => {
    const project = getProjectName({
      nameParam: 'abc',
    });
    expect(project).toEqual('abc');
  });

  it('should work with `vercel.json` config', () => {
    const project = getProjectName({
      nowConfig: { name: 'abc' },
    });
    expect(project).toEqual('abc');
  });

  it('should work with a directory', () => {
    const project = getProjectName({
      nowConfig: {},
      paths: ['/tmp/aa'],
    });
    expect(project).toEqual('aa');
  });
});
