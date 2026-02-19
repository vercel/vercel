import { readFileSync } from 'fs';
import { test, expect } from 'vitest';

test('version output was written', () => {
  const content = readFileSync('version-output.txt', 'utf-8');
  expect(content.length).toBeGreaterThan(0);
});

test('version output looks like a CLI version', () => {
  const content = readFileSync('version-output.txt', 'utf-8');
  // e.g. "Vercel CLI 39.0.0" or "39.0.0"
  expect(content).toMatch(/\d+\.\d+\.\d+/);
});
