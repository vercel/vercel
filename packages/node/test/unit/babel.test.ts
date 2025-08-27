import { describe, expect, test } from 'vitest';
import { compile } from '../../src/babel';

describe('babel.compile() security tests', () => {
  test('should compile valid JavaScript code', () => {
    const source = 'export const hello = "world";';
    const result = compile('test.js', source);
    
    expect(result).toBeDefined();
    expect(result.code).toContain('hello');
    expect(result.map).toBeDefined();
  });

  test('should reject filename with path traversal attempts', () => {
    const source = 'export const hello = "world";';
    
    expect(() => compile('../../../etc/passwd', source)).toThrow('Invalid filename provided');
    expect(() => compile('/etc/passwd', source)).toThrow('Filename contains invalid characters');
    expect(() => compile('..\\..\\windows\\system32', source)).toThrow('Filename contains invalid characters');
  });

  test('should reject invalid filename types', () => {
    const source = 'export const hello = "world";';
    
    expect(() => compile(null as any, source)).toThrow('Invalid filename provided');
    expect(() => compile(undefined as any, source)).toThrow('Invalid filename provided');
    expect(() => compile(123 as any, source)).toThrow('Invalid filename provided');
  });

  test('should reject extremely long filenames', () => {
    const source = 'export const hello = "world";';
    const longFilename = 'a'.repeat(300) + '.js';
    
    expect(() => compile(longFilename, source)).toThrow('Filename too long');
  });

  test('should reject filenames with path separators', () => {
    const source = 'export const hello = "world";';
    
    // These should be rejected due to path separators
    expect(() => compile('path/to/file.js', source)).toThrow('Invalid filename provided');
    expect(() => compile('..\\file.js', source)).toThrow('Invalid filename provided');
    expect(() => compile('file.js', source)).not.toThrow(); // This should pass
  });

  test('should reject source code that exceeds size limit', () => {
    const largeSource = 'export const data = "' + 'x'.repeat(1024 * 1024 + 1) + '";';
    
    expect(() => compile('test.js', largeSource)).toThrow('Source code exceeds maximum size');
  });

  test('should reject source with potentially dangerous eval patterns', () => {
    const maliciousSources = [
      'eval("malicious code")',
      'Function("return malicious")()',
      'setTimeout(() => { attack(); }, 0)',
      'setInterval(() => { attack(); }, 1000)',
      'obj.__proto__.malicious = true',
      'constructor.constructor("malicious")()',
    ];

    for (const source of maliciousSources) {
      expect(() => compile('test.js', source)).toThrow('Source code contains potentially unsafe patterns');
    }
  });

  test('should reject non-string source types', () => {
    expect(() => compile('test.js', null as any)).toThrow('Source must be a string');
    expect(() => compile('test.js', undefined as any)).toThrow('Source must be a string');
    expect(() => compile('test.js', 123 as any)).toThrow('Source must be a string');
    expect(() => compile('test.js', {} as any)).toThrow('Source must be a string');
  });

  test('should handle compilation errors gracefully', () => {
    const invalidSource = 'this is not valid javascript syntax {{{';
    
    expect(() => compile('test.js', invalidSource)).toThrow(/Babel compilation failed/);
  });

  test('should sanitize error messages to prevent information disclosure', () => {
    const invalidSource = 'const x = ;'; // Syntax error
    
    try {
      compile('test.js', invalidSource);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '';
      // Error message should not contain sensitive file paths
      expect(errorMessage).not.toMatch(/\/[^\s]+/); // No absolute paths
      expect(errorMessage).toContain('Babel compilation failed');
    }
  });

  test('should accept valid filename patterns', () => {
    const source = 'export const hello = "world";';
    const validFilenames = [
      'test.js',
      'my-file.js',
      'my_file.js',
      'file123.js',
      'test.min.js',
    ];

    for (const filename of validFilenames) {
      expect(() => compile(filename, source)).not.toThrow();
    }
  });

  test('should reject invalid filename characters', () => {
    const source = 'export const hello = "world";';
    const invalidFilenames = [
      'test<script>.js',
      'test>.js',
      'test|.js',
      'test?.js',
      'test*.js',
      'test\0.js',
    ];

    for (const filename of invalidFilenames) {
      expect(() => compile(filename, source)).toThrow('Filename contains invalid characters');
    }
  });

  test('should handle complex but valid JavaScript', () => {
    const source = `
      import { useState } from 'react';
      
      export default function Component() {
        const [count, setCount] = useState(0);
        return count;
      }
      
      export const asyncFunction = async () => {
        const data = await fetch('/api/data');
        return data.json();
      };
    `;
    
    const result = compile('component.js', source);
    expect(result.code).toBeDefined();
    expect(result.map).toBeDefined();
  });
});