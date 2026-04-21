jest.mock('execa', () => {
  const execa = Object.assign(jest.fn(), {
    stdout: jest.fn(),
  });
  return { __esModule: true, default: execa };
});

import execa from 'execa';
import { decideGoToolchain, GoWrapper } from '../src/go-helpers';

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

describe('decideGoToolchain', () => {
  it('returns auto when there is no go.mod', () => {
    expect(decideGoToolchain(undefined)).toBe('auto');
  });

  it('pins the toolchain for patch-level post-1.21 directives', () => {
    expect(decideGoToolchain({ go: '1.21.0' })).toBe('go1.21.0');
    expect(decideGoToolchain({ go: '1.23.1' })).toBe('go1.23.1');
  });

  it('pins the toolchain for pre-1.21 patch versions (modules exist retroactively)', () => {
    // proxy.golang.org publishes toolchain modules for every supported
    // release — verified via the info endpoint for v0.0.1-goX.Y.Z.<platform>.
    // Setting GOTOOLCHAIN to a pre-1.21 version causes the bootstrap Go to
    // download and re-exec into that version, matching the pre-PR behavior
    // where the builder itself downloaded the specific version.
    expect(decideGoToolchain({ go: '1.18.10' })).toBe('go1.18.10');
    expect(decideGoToolchain({ go: '1.20.14' })).toBe('go1.20.14');
    expect(decideGoToolchain({ go: '1.13.15' })).toBe('go1.13.15');
  });

  it('lets the toolchain directive win over the go directive', () => {
    expect(decideGoToolchain({ go: '1.21.0', toolchain: '1.22rc1' })).toBe(
      'go1.22rc1'
    );
    expect(decideGoToolchain({ go: '1.24.0', toolchain: '1.23.5' })).toBe(
      'go1.23.5'
    );
  });

  it('falls back to auto for malformed go versions', () => {
    expect(decideGoToolchain({ go: 'not-a-version' })).toBe('auto');
  });
});
