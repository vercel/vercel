import { describe, expect, test } from 'vitest';
import { compile } from '../../src/babel';

describe('babel.compile() security and functionality tests', () => {
  test('should compile valid JavaScript code', () => {
    const source = 'export const hello = "world";';
    const result = compile('test.js', source);
    
    expect(result).toBeDefined();
    expect(result.code).toContain('hello');
    expect(result.map).toBeDefined();
  });

  test('should handle legitimate file paths', () => {
    const source = 'export const component = "React";';
    
    // These should all work - legitimate paths
    expect(() => compile('src/components/Button.js', source)).not.toThrow();
    expect(() => compile('pages/api/user.js', source)).not.toThrow();
    expect(() => compile('./components/Header.js', source)).not.toThrow();
    expect(() => compile('utils/helpers.js', source)).not.toThrow();
  });

  test('should reject path traversal attacks', () => {
    const source = 'export const hello = "world";';
    
    // Path traversal should be blocked
    expect(() => compile('../../../etc/passwd', source)).toThrow('path traversal');
    expect(() => compile('..\\..\\windows\\system32', source)).toThrow('path traversal');
    expect(() => compile('legitimate/../../../etc/passwd', source)).toThrow('path traversal');
  });

  test('should reject invalid filename types', () => {
    const source = 'export const hello = "world";';
    
    expect(() => compile(null as any, source)).toThrow('Filename must be a non-empty string');
    expect(() => compile(undefined as any, source)).toThrow('Filename must be a non-empty string');
    expect(() => compile(123 as any, source)).toThrow('Filename must be a non-empty string');
    expect(() => compile('', source)).toThrow('Filename must be a non-empty string');
  });

  test('should reject filenames with null bytes', () => {
    const source = 'export const hello = "world";';
    
    expect(() => compile('test\0.js', source)).toThrow('null bytes');
    expect(() => compile('file.js\0', source)).toThrow('null bytes');
  });

  test('should reject extremely long file paths', () => {
    const source = 'export const hello = "world";';
    const longPath = 'a/'.repeat(500) + 'file.js'; // > 1000 characters
    
    expect(() => compile(longPath, source)).toThrow('path is too long');
  });

  test('should reject source code that exceeds size limit', () => {
    const largeSource = 'export const data = "' + 'x'.repeat(5 * 1024 * 1024 + 1) + '";';
    
    expect(() => compile('test.js', largeSource)).toThrow('exceeds maximum size');
  });

  test('should accept legitimate JavaScript patterns that were previously blocked', () => {
    // These should all work now - they are legitimate JavaScript patterns
    const legitimateSources = [
      'setTimeout(() => { console.log("timer"); }, 1000);',
      'setInterval(() => { poll(); }, 5000);',
      'const fn = new Function("return 42");',
      'eval("1 + 1"); // This might be legitimate in some contexts',
      'obj.__proto__ = {};',
      'constructor.constructor("x", "return x")(42);',
    ];

    for (const source of legitimateSources) {
      expect(() => compile('test.js', source)).not.toThrow();
    }
  });

  test('should reject non-string source types', () => {
    expect(() => compile('test.js', null as any)).toThrow('Source code must be a string');
    expect(() => compile('test.js', undefined as any)).toThrow('Source code must be a string');
    expect(() => compile('test.js', 123 as any)).toThrow('Source code must be a string');
    expect(() => compile('test.js', {} as any)).toThrow('Source code must be a string');
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
      expect(errorMessage).not.toMatch(/\/home\/[^\s]+/); // No absolute paths
      expect(errorMessage).not.toMatch(/[A-Za-z]:[^\s]+/); // No Windows paths  
      expect(errorMessage).toContain('Babel compilation failed');
    }
  });

  test('should handle complex real-world JavaScript', () => {
    const source = `
      import { useState } from 'react';
      
      export default function Component() {
        const [count, setCount] = useState(0);
        
        // These patterns should be allowed now
        const timer = setTimeout(() => {
          setCount(c => c + 1);
        }, 1000);
        
        const interval = setInterval(() => {
          console.log('polling...');
        }, 5000);
        
        return count;
      }
      
      export const asyncFunction = async () => {
        const data = await fetch('/api/data');
        return data.json();
      };
      
      // Dynamic code execution (might be legitimate)
      export const dynamicEval = (code) => {
        return eval(code); // This should now be allowed
      };
    `;
    
    const result = compile('src/components/ComplexComponent.js', source);
    expect(result.code).toBeDefined();
    expect(result.map).toBeDefined();
    expect(result.code).toContain('setTimeout');
    expect(result.code).toContain('setInterval');
  });

  test('should preserve source maps correctly', () => {
    const source = `
      export const add = (a, b) => a + b;
      export const multiply = (a, b) => a * b;
    `;
    
    const result = compile('math.js', source);
    expect(result.map).toBeDefined();
    expect(result.map.sources).toBeDefined();
    expect(result.map.mappings).toBeDefined();
  });

  test('should handle edge case filenames', () => {
    const source = 'export const test = true;';
    
    // These edge cases should work
    expect(() => compile('file-name.js', source)).not.toThrow();
    expect(() => compile('file_name.js', source)).not.toThrow();
    expect(() => compile('123file.js', source)).not.toThrow();
    expect(() => compile('file.min.js', source)).not.toThrow();
    expect(() => compile('file@version.js', source)).not.toThrow();
  });
});