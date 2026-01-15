import { getNewHandlerFunctionName, getWrapperRoutes } from '../src/index';

describe('getWrapperRoutes', () => {
  it('handles root main.go', () => {
    const routes = getWrapperRoutes('main.go');
    expect(routes).toEqual([{ src: '/(.*)', dest: '/' }]);
  });

  it('handles root index.go', () => {
    const routes = getWrapperRoutes('index.go');
    expect(routes).toEqual([{ src: '/(.*)', dest: '/' }]);
  });

  it('handles nested main.go', () => {
    const routes = getWrapperRoutes('api/main.go');
    expect(routes).toEqual([
      { src: '/api/(.*)', dest: '/api' },
      { src: '/api', dest: '/api' },
    ]);
  });

  it('handles nested index.go', () => {
    const routes = getWrapperRoutes('api/index.go');
    expect(routes).toEqual([
      { src: '/api/(.*)', dest: '/api' },
      { src: '/api', dest: '/api' },
    ]);
  });

  it('handles nested named file', () => {
    const routes = getWrapperRoutes('api/users.go');
    expect(routes).toEqual([
      { src: '/api/users/(.*)', dest: '/api/users' },
      { src: '/api/users', dest: '/api/users' },
    ]);
  });

  it('handles deeply nested file', () => {
    const routes = getWrapperRoutes('api/v1/posts/index.go');
    expect(routes).toEqual([
      { src: '/api/v1/posts/(.*)', dest: '/api/v1/posts' },
      { src: '/api/v1/posts', dest: '/api/v1/posts' },
    ]);
  });
});

describe('getNewHandlerFunctionName', function () {
  it('does nothing with empty original function name', async () => {
    let error: Error | undefined;
    try {
      getNewHandlerFunctionName('', 'some/kind-of-file.js');
    } catch (err: unknown) {
      error = err as Error;
    }

    expect(error).toBeDefined();
    expect(error?.message).toEqual(
      'Handler function renaming failed because original function name was empty.'
    );
  });

  it('does nothing with empty original function name', async () => {
    let error: Error | undefined;
    try {
      getNewHandlerFunctionName('Handler', '');
    } catch (err: unknown) {
      error = err as Error;
    }

    expect(error).toBeDefined();
    expect(error?.message).toEqual(
      'Handler function renaming failed because entrypoint was empty.'
    );
  });

  it('generates slug with back slashes in file path', async () => {
    const newFunctionName = getNewHandlerFunctionName(
      'Handler',
      'some\\file.js'
    );
    expect(newFunctionName).toEqual('Handler_some_file_js');
  });

  it('generates slug with forward slashes in file path', async () => {
    const newFunctionName = getNewHandlerFunctionName(
      'Handler',
      'some/file.js'
    );
    expect(newFunctionName).toEqual('Handler_some_file_js');
  });

  it('generates slug with dashes in file path', async () => {
    const newFunctionName = getNewHandlerFunctionName(
      'Handler',
      'kind-of-file.js'
    );
    expect(newFunctionName).toEqual('Handler_kind_of_file_js');
  });

  it('generates slug with dashes in file path', async () => {
    const newFunctionName = getNewHandlerFunctionName(
      'Handler',
      'kind-of-file.js'
    );
    expect(newFunctionName).toEqual('Handler_kind_of_file_js');
  });

  it('generates slug with brackets in file path', async () => {
    const newFunctionName = getNewHandlerFunctionName(
      'Handler',
      '[segment].js'
    );
    // this expects two underscores on each side intentionally
    // left (1): there's an added separator between original function name and slug;
    // left (2): the opening bracket is replaced
    // right (1): the closing bracket is replaced
    // right (2): the period is replaced
    expect(newFunctionName).toEqual('Handler__segment__js');
  });

  it('generates slug with space in file path', async () => {
    const newFunctionName = getNewHandlerFunctionName(
      'Handler',
      'kind of file.js'
    );
    expect(newFunctionName).toEqual('Handler_kind_of_file_js');
  });

  it('generates slug with periods in file path', async () => {
    const newFunctionName = getNewHandlerFunctionName(
      'Handler',
      'kind.of.file.js'
    );
    expect(newFunctionName).toEqual('Handler_kind_of_file_js');
  });
});
