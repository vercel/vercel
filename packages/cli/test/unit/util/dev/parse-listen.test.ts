import {
  parseListen,
  replaceLocalhost,
} from '../../../../src/util/dev/parse-listen';

const IS_WINDOWS = process.platform === 'win32';

describe('parseListen', () => {
  it('should parse "0" as port 0', () => {
    const result = parseListen('0');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(0);
  });

  it('should parse "3000" as port 3000', () => {
    const result = parseListen('3000');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(3000);
  });

  it('should parse "0.0.0.0" as IP address', () => {
    const result = parseListen('0.0.0.0');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(3000);
    expect(result[1]).toEqual('0.0.0.0');
  });

  it('should parse "127.0.0.1:4000" as IP address and port', () => {
    const result = parseListen('127.0.0.1:4000');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(4000);
    expect(result[1]).toEqual('127.0.0.1');
  });

  it('should parse "tcp://127.0.0.1:5000" as IP address and port', () => {
    const result = parseListen('tcp://127.0.0.1:5000');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(5000);
    expect(result[1]).toEqual('127.0.0.1');
  });

  it('should parse "unix:/home/user/server.sock" as UNIX socket file', () => {
    if (IS_WINDOWS) {
      console.log('Skipping this test on Windows.');
      return;
    }

    const result = parseListen('unix:/home/user/server.sock');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual('/home/user/server.sock');
  });

  it('should parse "pipe:\\\\.\\pipe\\PipeName" as UNIX pipe', () => {
    if (IS_WINDOWS) {
      console.log('Skipping this test on Windows.');
      return;
    }

    const result = parseListen('pipe:\\\\.\\pipe\\PipeName');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual('\\\\.\\pipe\\PipeName');
  });

  it('should fail to parse "bad://url"', () => {
    let err: Error;
    try {
      parseListen('bad://url');
      throw new Error('Should not happen');
    } catch (_err) {
      err = _err;
    }
    expect(err.message).toEqual('Unknown `--listen` scheme (protocol): bad:');
  });
});

describe('replaceLocalhost', () => {
  test.each([
    { input: 'http://192.168.0.1:1234', output: 'http://192.168.0.1:1234' },
    { input: 'http://127.0.0.1:4000', output: 'http://127.0.0.1:4000' },
    { input: 'http://[::1]:3001', output: 'http://[::1]:3001' },
    { input: 'http://0.0.0.0:3000', output: 'http://localhost:3000' },
    { input: 'http://[::]:3002', output: 'http://localhost:3002' },
  ])('"$input" → "$output"', ({ input, output }) => {
    expect(replaceLocalhost(input)).toEqual(output);
  });
});
