import { getNewHandlerFunctionName } from '../src/index';

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
