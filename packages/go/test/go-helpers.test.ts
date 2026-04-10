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

function createResolvedSubprocess() {
  return Object.assign(Promise.resolve({ stdout: '', stderr: '' }), {
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
    const compilerOutput =
      '# example.com/project\n./main.go:14:9: undefined: handler';
    const execaError = Object.assign(
      new Error(
        'Command failed: go build -ldflags -s -w -o /tmp/3db69a0d/user-server .'
      ),
      {
        stderr: compilerOutput,
        stdout: '',
      }
    );
    mockedExeca.mockReturnValue(createRejectedSubprocess(execaError) as any);

    const go = new GoWrapper(process.env as any);

    let error: Error | undefined;
    try {
      await go.build('.', '/tmp/3db69a0d/user-server');
    } catch (err: unknown) {
      error = err as Error;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain(
      'Command failed: go build -ldflags -s -w -o /tmp/3db69a0d/user-server .'
    );
    expect(error?.message).toContain(compilerOutput);
    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['build', '-ldflags', '-s -w', '-o', '/tmp/3db69a0d/user-server', '.'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('calls go mod tidy', async () => {
    mockedExeca.mockReturnValue(createResolvedSubprocess() as any);

    const go = new GoWrapper(process.env as any);
    await go.mod();

    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['mod', 'tidy'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('calls go mod tidy with -e when tolerateErrors is true', async () => {
    mockedExeca.mockReturnValue(createResolvedSubprocess() as any);

    const go = new GoWrapper(process.env as any);
    await go.mod({ tolerateErrors: true });

    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['mod', 'tidy', '-e'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('calls go mod vendor', async () => {
    mockedExeca.mockReturnValue(createResolvedSubprocess() as any);

    const go = new GoWrapper(process.env as any);
    await go.vendor();

    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['mod', 'vendor'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('includes -mod=vendor flag when vendorMode is true', async () => {
    mockedExeca.mockReturnValue(createResolvedSubprocess() as any);

    const go = new GoWrapper(process.env as any);
    await go.build('.', '/tmp/out', { vendorMode: true });

    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['build', '-ldflags', '-s -w', '-mod=vendor', '-o', '/tmp/out', '.'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('does not add -mod=vendor when GO_BUILD_FLAGS is set', async () => {
    mockedExeca.mockReturnValue(createResolvedSubprocess() as any);

    const env = { ...process.env, GO_BUILD_FLAGS: '-tags test' };
    const go = new GoWrapper(env as any);
    await go.build('.', '/tmp/out', { vendorMode: true });

    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['build', '-tags', 'test', '-o', '/tmp/out', '.'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });

  it('does not add -mod=vendor when vendorMode is false', async () => {
    mockedExeca.mockReturnValue(createResolvedSubprocess() as any);

    const go = new GoWrapper(process.env as any);
    await go.build('.', '/tmp/out');

    expect(mockedExeca).toHaveBeenCalledWith(
      'go',
      ['build', '-ldflags', '-s -w', '-o', '/tmp/out', '.'],
      expect.objectContaining({ stdio: 'pipe' })
    );
  });
});
