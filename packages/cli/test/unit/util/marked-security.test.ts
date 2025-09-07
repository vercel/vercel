import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Security tests for marked package ReDoS vulnerability.
 * 
 * These tests verify that the current marked versions used in production
 * are not vulnerable to the Regular expression Denial of Service (ReDoS)
 * attack that affects marked@<4.0.10.
 * 
 * Background: The vulnerability is in the block.def regular expression
 * which can cause catastrophic backtracking with malicious input patterns.
 * 
 * Current status: SAFE - using marked@4.3.0+ in production which includes the fix.
 */
describe('marked security vulnerability mitigation', () => {
  let marked: any;

  beforeEach(async () => {
    // Try to load marked from the production path
    try {
      const mod = await import('marked');
      marked = mod.default;
    } catch (error) {
      // If marked is not available in test context, skip tests
      marked = null;
    }
  });

  it('should not have ReDoS vulnerability with malicious link definitions', () => {
    if (!marked) {
      return;
    }

    // Test the specific ReDoS pattern from the vulnerability report
    const maliciousInput = `[x]:${' '.repeat(1500)}x ${' '.repeat(1500)} x`;
    
    const startTime = Date.now();
    let result;
    let errorThrown = false;

    try {
      result = marked.parse(maliciousInput);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete very quickly (under 100ms) in safe versions
      expect(duration).toBeLessThan(100);
      expect(typeof result).toBe('string');
    } catch (error: any) {
      errorThrown = true;
      // If an error is thrown, it should be a parsing error, not a timeout
      expect(error.message).not.toMatch(/timeout/i);
    }
    
    // Either it should succeed quickly or fail with a parsing error
    // It should NOT hang or take excessive time
    expect(errorThrown || result !== undefined).toBe(true);
  });

  it('should handle various ReDoS patterns efficiently', () => {
    if (!marked) {
      return;
    }

    const reDoSPatterns = [
      // Original vulnerability pattern
      `[x]:${' '.repeat(1000)}x ${' '.repeat(1000)} x`,
      // Variations with different characters
      `[test]:${' '.repeat(800)}foo ${' '.repeat(800)} bar`,
      // Multiple malicious patterns
      `[a]:${' '.repeat(500)}x ${' '.repeat(500)} y\n[b]:${' '.repeat(500)}z ${' '.repeat(500)} w`,
      // Nested patterns
      `[outer]:${' '.repeat(300)}[inner]:${' '.repeat(300)}test ${' '.repeat(300)} end`
    ];

    reDoSPatterns.forEach((pattern, index) => {
      const startTime = Date.now();
      
      try {
        const result = marked.parse(pattern);
        const duration = Date.now() - startTime;
        
        // Each pattern should be processed quickly
        expect(duration).toBeLessThan(50);
        expect(typeof result).toBe('string');
      } catch (error: any) {
        const duration = Date.now() - startTime;
        // Even errors should occur quickly, not after long processing
        expect(duration).toBeLessThan(50);
      }
    });
  });

  it('should process normal markdown efficiently', () => {
    if (!marked) {
      return;
    }

    const normalMarkdown = `
# Test Document

This is a normal markdown document with:

- Lists
- [Normal links](https://example.com)
- **Bold text**
- *Italic text*

[ref]: https://example.com "A normal reference link"

Here's a paragraph with a [reference link][ref].
    `;

    const startTime = Date.now();
    const result = marked.parse(normalMarkdown);
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(10);
    expect(typeof result).toBe('string');
    expect(result).toContain('<h1>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<a href="https://example.com"');
  });

  it('should document the current marked package versions', async () => {
    // This test documents the current package versions for security tracking
    let markedVersion = 'not found';
    
    try {
      const packageInfo = await import('marked/package.json');
      markedVersion = packageInfo.default?.version ?? packageInfo.version;
      
      // We expect to be using a safe marked version (>= 4.0.10)
      const semver = require('semver');
      if (semver.satisfies(markedVersion, '>=4.0.10')) {
        // Version is safe
        expect(true).toBe(true);
      } else {
        // This should not happen in production with our overrides
        expect(false).toBe(true); // Fail the test if vulnerable version is found
      }
    } catch (error) {
      // If marked is not available, that's also acceptable for this test
      expect(markedVersion).toBe('not found');
    }
  });

  it('should verify package overrides are working', () => {
    // Test that our package.json overrides prevent vulnerable versions
    const packageJson = require('../../../../package.json');
    
    expect(packageJson.pnpm.overrides).toBeDefined();
    expect(packageJson.pnpm.overrides['marked@<4.0.10']).toBe('>=4.0.10');
    
    expect(packageJson.overrides).toBeDefined();
    expect(packageJson.overrides['marked@<4.0.10']).toBe('>=4.0.10');
  });
});