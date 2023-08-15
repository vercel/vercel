import getProjectName from '../../../src/util/get-project-name';

describe('getProjectName', () => {
  it.skip('should work with argv', () => {
    const project = getProjectName({
      argv: {
        '--name': 'abc',
      },
    });
    expect(project).toEqual('abc');
  });

  it.skip('should work with `vercel.json` config', () => {
    const project = getProjectName({
      argv: {},
      nowConfig: { name: 'abc' },
    });
    expect(project).toEqual('abc');
  });

  it.skip('should work with a directory', () => {
    const project = getProjectName({
      argv: {},
      nowConfig: {},
      paths: ['/tmp/aa'],
    });
    expect(project).toEqual('aa');
  });
});
