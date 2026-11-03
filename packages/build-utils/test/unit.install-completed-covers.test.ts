import path from 'path';
import { afterEach, expect, it } from 'vitest';
import { installCompletedCovers } from '../src';

const fixturePackageJson = path.join(
  __dirname,
  'fixtures',
  '02-zero-config-api',
  'package.json'
);
const otherPackageJson = path.join(
  __dirname,
  'fixtures',
  'some-other-root',
  'package.json'
);

afterEach(() => {
  delete process.env.VERCEL_INSTALL_COMPLETED;
  delete process.env.VERCEL_INSTALL_COMPLETED_PATH;
});

it('returns false when the marker is not set', () => {
  expect(installCompletedCovers(fixturePackageJson)).toBe(false);
});

it('returns false when the marker is not "1"', () => {
  process.env.VERCEL_INSTALL_COMPLETED = '0';
  expect(installCompletedCovers(fixturePackageJson)).toBe(false);
});

it('returns true for every package.json when the marker has no path scope', () => {
  process.env.VERCEL_INSTALL_COMPLETED = '1';
  expect(installCompletedCovers(fixturePackageJson)).toBe(true);
  expect(installCompletedCovers(otherPackageJson)).toBe(true);
  expect(installCompletedCovers(undefined)).toBe(true);
});

it('returns true only for the package.json the marker path names', () => {
  process.env.VERCEL_INSTALL_COMPLETED = '1';
  process.env.VERCEL_INSTALL_COMPLETED_PATH = fixturePackageJson;
  expect(installCompletedCovers(fixturePackageJson)).toBe(true);
  expect(installCompletedCovers(otherPackageJson)).toBe(false);
  expect(installCompletedCovers(undefined)).toBe(false);
});
