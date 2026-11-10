import { describe, it, expect } from 'vitest';
import { parsePep508 } from '../src/manifest/pep508';

describe('parsePep508', () => {
  it('parses a simple package name', async () => {
    const result = await parsePep508('flask');
    expect(result).toEqual({ name: 'flask' });
  });

  it('parses a package with version specifier', async () => {
    const result = await parsePep508('flask>=2.0');
    expect(result).toEqual({ name: 'flask', version: '>=2.0' });
  });

  it('parses a package with compound version specifiers', async () => {
    const result = await parsePep508('django>=4.0,<5.0');
    expect(result).toEqual({ name: 'django', version: '>=4.0, <5.0' });
  });

  it('parses a package with extras', async () => {
    const result = await parsePep508('requests[security,socks]');
    expect(result).toEqual({
      name: 'requests',
      extras: ['security', 'socks'],
    });
  });

  it('parses a package with extras and version', async () => {
    const result = await parsePep508('uvicorn[standard]>=0.20');
    expect(result).toEqual({
      name: 'uvicorn',
      version: '>=0.20',
      extras: ['standard'],
    });
  });

  it('parses a package with environment markers', async () => {
    const result = await parsePep508('pywin32>=300 ; sys_platform == "win32"');
    expect(result).toEqual({
      name: 'pywin32',
      version: '>=300',
      markers: "sys_platform == 'win32'",
    });
  });

  it('parses full PEP 508 with extras, version, and markers', async () => {
    const result = await parsePep508(
      'flask[async]>=2.0 ; python_version >= "3.8"'
    );
    expect(result).toEqual({
      name: 'flask',
      version: '>=2.0',
      extras: ['async'],
      // uv normalizes python_version to python_full_version and quotes to single
      markers: "python_full_version >= '3.8'",
    });
  });

  it('parses URL-based dependency', async () => {
    const result = await parsePep508(
      'mypackage @ https://example.com/pkg.tar.gz'
    );
    expect(result).not.toBeNull();
    expect(result!.name).toBe('mypackage');
    expect(result!.url).toContain('https://example.com/pkg.tar.gz');
  });

  it('returns null for invalid input', async () => {
    const result = await parsePep508('!!!invalid');
    expect(result).toBeNull();
  });

  it('returns null for empty string', async () => {
    const result = await parsePep508('');
    expect(result).toBeNull();
  });

  it('normalizes package name casing', async () => {
    const result = await parsePep508('Flask>=2.0');
    expect(result).not.toBeNull();
    // uv-pep508 normalizes names per PEP 503
    expect(result!.name).toBe('flask');
  });

  it('parses compatible release version', async () => {
    const result = await parsePep508('numpy~=1.24.0');
    expect(result).toEqual({ name: 'numpy', version: '~=1.24.0' });
  });

  it('parses exact version', async () => {
    const result = await parsePep508('requests==2.28.0');
    expect(result).toEqual({ name: 'requests', version: '==2.28.0' });
  });

  it('parses a batch of dependency strings', async () => {
    const results = await parsePep508([
      'flask>=2.0',
      '!!!invalid',
      'requests[security]',
    ]);
    expect(results).toEqual([
      { name: 'flask', version: '>=2.0' },
      null,
      { name: 'requests', extras: ['security'] },
    ]);
  });

  it('returns empty array for empty batch', async () => {
    const results = await parsePep508([]);
    expect(results).toEqual([]);
  });
});
