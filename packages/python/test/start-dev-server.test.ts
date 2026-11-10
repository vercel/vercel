import { describe, expect, it } from 'vitest';
import { escapePythonStringContents } from '../src/start-dev-server';

describe('Python development shim', () => {
  it('escapes Windows paths for a double-quoted Python string', () => {
    const windowsPath = String.raw`D:\a\_temp\vercel-native\server.py`;
    const escaped = escapePythonStringContents(windowsPath);

    expect(escaped).toBe(String.raw`D:\\a\\_temp\\vercel-native\\server.py`);
    expect(`"${escaped}"`).toBe(JSON.stringify(windowsPath));
  });

  it('escapes quotes and control characters', () => {
    const value = 'service"name\nnext';
    expect(`"${escapePythonStringContents(value)}"`).toBe(
      JSON.stringify(value)
    );
  });
});
