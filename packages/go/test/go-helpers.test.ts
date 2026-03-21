jest.mock('execa', () => {
  const execa = Object.assign(jest.fn(), {
    stdout: jest.fn(),
  });
  return { __esModule: true, default: execa };
});

import execa from 'execa';
import { GoWrapper } from '../src/go-helpers';

const mockedExeca = execa as unknown as jest.MockedFunction<typeof execa> & {
  stdout: jest.Mock;
};

function createRejectedSubprocess(error: Error) {
  return Object.assign(Promise.reject(error), {
    stdout: undefined,
    stderr: undefined,
  });
}

describe('GoWrapper', () => {
  beforeEach(() => {
    mockedExeca.mockReset();
    mockedExeca.stdout.mockReset();
  });

  it('includes compiler output when go build fails', async () => {
    const expectedArgs = [
      'build',
      ...(process.platform === 'win32' ? [] : ['-ldflags', '-s -w']),
      '-o',
      '/tmp/3db69a0d/user-server',
      '.',
    ];
    const expectedCommand = `Command failed: go ${expectedArgs.join(' ')}`;
    const compilerOutput =
      '# example.com/project\n./main.go:14:9: undefined: handler';
    const execaError = Object.assign(new Error(expectedCommand), {
      stderr: compilerOutput,
      stdout: '',
    });
    mockedExeca.mockReturnValue(createRejectedSubprocess(execaError) as any);

    const go = new GoWrapper({} as any);

    let error: Error | undefined;
    try {
      await go.build('.', '/tmp/3db69a0d/user-server');
    } catch (err: unknown) {
      error = err as Error;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain(expectedCommand);
    expect(error?.message).toContain(compilerOutput);
    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      expectedArgs,
      expect.objectContaining({ stdio: 'pipe' })
    );
  });
});
