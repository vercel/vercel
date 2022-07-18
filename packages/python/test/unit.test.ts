import { getSupportedPythonVersion } from '../src/version';

let warningMessages: string[];
const originalConsoleWarn = console.warn;
const realDateNow = Date.now.bind(global.Date);
beforeEach(() => {
  warningMessages = [];
  console.warn = m => {
    warningMessages.push(m);
  };
});

afterEach(() => {
  console.warn = originalConsoleWarn;
  global.Date.now = realDateNow;
});

it('should only match supported versions, otherwise throw an error', async () => {
  expect(
    getSupportedPythonVersion({ pipLockPythonVersion: '3.9' })
  ).toHaveProperty('runtime', 'python3.9');
});

it('should ignore minor version in vercel dev', async () => {
  expect(
    getSupportedPythonVersion({ pipLockPythonVersion: '3.9', isDev: true })
  ).toHaveProperty('runtime', 'python3');
  expect(
    getSupportedPythonVersion({ pipLockPythonVersion: '3.6', isDev: true })
  ).toHaveProperty('runtime', 'python3');
  expect(
    getSupportedPythonVersion({ pipLockPythonVersion: '999', isDev: true })
  ).toHaveProperty('runtime', 'python3');
  expect(warningMessages).toStrictEqual([]);
});

it('should select latest version when no Piplock detected', async () => {
  expect(
    getSupportedPythonVersion({ pipLockPythonVersion: undefined })
  ).toHaveProperty('runtime', 'python3.9');
  expect(warningMessages).toStrictEqual([]);
});

it('should select latest version and warn when invalid Piplock detected', async () => {
  expect(
    getSupportedPythonVersion({ pipLockPythonVersion: '999' })
  ).toHaveProperty('runtime', 'python3.9');
  expect(warningMessages).toStrictEqual([
    'Warning: Python version "999" detected in Pipfile.lock is invalid and will be ignored. http://vercel.link/python-version',
  ]);
});

it('should throw for discontinued versions', async () => {
  global.Date.now = () => new Date('2022-07-31').getTime();
  expect(() =>
    getSupportedPythonVersion({ pipLockPythonVersion: '3.6' })
  ).toThrow(
    'Python version "3.6" detected in Pipfile.lock is discontinued and must be upgraded.'
  );
  expect(warningMessages).toStrictEqual([]);
});

it('should warn for deprecated versions, soon to be discontinued', async () => {
  global.Date.now = () => new Date('2021-07-01').getTime();

  expect(
    getSupportedPythonVersion({ pipLockPythonVersion: '3.6' })
  ).toHaveProperty('runtime', 'python3.6');
  expect(warningMessages).toStrictEqual([
    'Error: Python version "3.6" detected in Pipfile.lock has reached End-of-Life. Deployments created on or after 2022-07-18 will fail to build. http://vercel.link/python-version',
  ]);
});
