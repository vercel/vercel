import { getSupportedPythonVersion } from '../src/version';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';

const tmpPythonDir = path.join(
  tmpdir(),
  `vc-test-python-${Math.floor(Math.random() * 1e6)}`
);
let warningMessages: string[];
const originalConsoleWarn = console.warn;
const realDateNow = Date.now.bind(global.Date);
const origPath = process.env.PATH;

beforeEach(() => {
  warningMessages = [];
  console.warn = m => {
    warningMessages.push(m);
  };
});

afterEach(() => {
  console.warn = originalConsoleWarn;
  global.Date.now = realDateNow;
  process.env.PATH = origPath;
  if (fs.existsSync(tmpPythonDir)) {
    fs.removeSync(tmpPythonDir);
  }
});

it('should only match supported versions, otherwise throw an error', async () => {
  const result = getSupportedPythonVersion({ pipLockPythonVersion: '3.9' });
  expect(result).toHaveProperty('runtime');
  expect(result.runtime).toMatch(/^python3.\d+/);
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
  ).toHaveProperty('runtime', 'python3.11');
  expect(warningMessages).toStrictEqual([]);
});

it('should select latest version and warn when invalid Piplock detected', async () => {
  expect(
    getSupportedPythonVersion({ pipLockPythonVersion: '999' })
  ).toHaveProperty('runtime', 'python3.11');
  expect(warningMessages).toStrictEqual([
    'Warning: Python version "999" detected in Pipfile.lock is invalid and will be ignored. http://vercel.link/python-version',
  ]);
});

it('should throw if python not found', async () => {
  process.env.PATH = '.';
  expect(() =>
    getSupportedPythonVersion({ pipLockPythonVersion: '3.6' })
  ).toThrow('Unable to find any supported Python versions.');
  expect(warningMessages).toStrictEqual([]);
});

it('should throw for discontinued versions', async () => {
  global.Date.now = () => new Date('2022-07-31').getTime();
  makeMockPython('3.6');

  expect(() =>
    getSupportedPythonVersion({ pipLockPythonVersion: '3.6' })
  ).toThrow(
    'Python version "3.6" detected in Pipfile.lock is discontinued and must be upgraded.'
  );
  expect(warningMessages).toStrictEqual([]);
});

it('should warn for deprecated versions, soon to be discontinued', async () => {
  global.Date.now = () => new Date('2021-07-01').getTime();
  makeMockPython('3.6');

  expect(
    getSupportedPythonVersion({ pipLockPythonVersion: '3.6' })
  ).toHaveProperty('runtime', 'python3.6');
  expect(warningMessages).toStrictEqual([
    'Error: Python version "3.6" detected in Pipfile.lock has reached End-of-Life. Deployments created on or after 2022-07-18 will fail to build. http://vercel.link/python-version',
  ]);
});

function makeMockPython(version: string) {
  fs.mkdirSync(tmpPythonDir);
  for (const name of ['python', 'pip']) {
    const bin = path.join(
      tmpPythonDir,
      `${name}${version}${process.platform === 'win32' ? '.exe' : ''}`
    );
    fs.writeFileSync(bin, '');
    fs.chmodSync(bin, 0o755);
  }
  process.env.PATH = `${tmpPythonDir}${path.delimiter}${process.env.PATH}`;
}
