import getProjectName from '../../src/util/get-project-name';

describe('getProjectName', () => {
  it('should work with argv', () => {
    const project = getProjectName({
      argv: {
        '--name': 'abc',
      },
    });
    expect(project).toEqual('abc');
  });

  it('should work with now.json', () => {
    const project = getProjectName({
      argv: {},
      nowConfig: { name: 'abc' },
    });
    expect(project).toEqual('abc');
  });

  it('should work with a file', () => {
    const project = getProjectName({
      argv: {},
      nowConfig: {},
      isFile: true,
    });
    expect(project).toEqual('files');
  });

  it('should work with a multiple files', () => {
    const project = getProjectName({
      argv: {},
      nowConfig: {},
      paths: ['/tmp/aa/abc.png', '/tmp/aa/bbc.png'],
    });
    expect(project).toEqual('files');
  });

  it('should work with a directory', () => {
    const project = getProjectName({
      argv: {},
      nowConfig: {},
      paths: ['/tmp/aa'],
    });
    expect(project).toEqual('aa');
  });
});
