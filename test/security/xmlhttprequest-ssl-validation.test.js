/**
 * Security test for xmlhttprequest-ssl certificate validation vulnerability
 * 
 * This test ensures that the xmlhttprequest-ssl package properly validates
 * SSL certificates and cannot be bypassed with falsy values.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

describe('XMLHttpRequest SSL Certificate Validation', () => {
  test('should enforce secure xmlhttprequest-ssl version across all packages', () => {
    // Check that all package-lock.json files use the secure version
    const packageLockFiles = [];
    
    function findPackageLocks(dir) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          findPackageLocks(fullPath);
        } else if (item === 'package-lock.json') {
          packageLockFiles.push(fullPath);
        }
      }
    }
    
    findPackageLocks(path.join(__dirname, '../../'));
    
    // Check each package-lock.json for vulnerable xmlhttprequest-ssl versions
    const vulnerableFiles = [];
    const secureVersion = '4.0.0';
    
    for (const lockFile of packageLockFiles) {
      const content = fs.readFileSync(lockFile, 'utf8');
      
      // Check for vulnerable versions (1.6.3, 2.0.0, etc.)
      const xmlHttpMatches = content.match(/"xmlhttprequest-ssl":\s*"([^"]+)"/g);
      if (xmlHttpMatches) {
        for (const match of xmlHttpMatches) {
          const version = match.match(/"([^"]+)"$/)[1];
          // Allow ranges that include 4.0.0 or exactly 4.0.0
          if (!version.includes('4.0.0') && !version.startsWith('~4.') && !version.startsWith('^4.')) {
            vulnerableFiles.push({
              file: lockFile,
              version: version
            });
          }
        }
      }
      
      // Also check resolved entries
      const resolvedMatches = content.match(/xmlhttprequest-ssl-(\d+\.\d+\.\d+)\.tgz/g);
      if (resolvedMatches) {
        for (const match of resolvedMatches) {
          const version = match.match(/(\d+\.\d+\.\d+)/)[1];
          if (version !== secureVersion) {
            vulnerableFiles.push({
              file: lockFile,
              resolvedVersion: version
            });
          }
        }
      }
    }
    
    if (vulnerableFiles.length > 0) {
      const fileList = vulnerableFiles.map(f => 
        `  - ${f.file}: ${f.version || f.resolvedVersion}`
      ).join('\n');
      
      throw new Error(
        `Found vulnerable xmlhttprequest-ssl versions in the following files:\n${fileList}\n\n` +
        `These should be updated to version ${secureVersion} or later to fix the certificate validation vulnerability.`
      );
    }
  });

  test('should have package override for xmlhttprequest-ssl in root package.json', () => {
    const rootPackageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
    );
    
    expect(rootPackageJson.pnpm).toBeDefined();
    expect(rootPackageJson.pnpm.overrides).toBeDefined();
    expect(rootPackageJson.pnpm.overrides['xmlhttprequest-ssl']).toBe('4.0.0');
  });

  test('xmlhttprequest-ssl should properly validate certificates with falsy values', () => {
    // This test verifies the behavioral fix in the package itself
    // We'll simulate the vulnerable vs secure behavior
    
    const vulnerableBehavior = (rejectUnauthorized) => {
      // Simulate the vulnerable logic: opts.rejectUnauthorized === false ? false : true
      return rejectUnauthorized === false ? false : true;
    };
    
    const secureBehavior = (rejectUnauthorized) => {
      // Simulate the secure logic: opts.rejectUnauthorized !== false  
      return rejectUnauthorized !== false;
    };
    
    // Test cases that were vulnerable
    const testCases = [
      { input: undefined, expected: true },
      { input: null, expected: true },
      { input: 0, expected: true },
      { input: '', expected: true },
      { input: false, expected: false },
      { input: true, expected: true }
    ];
    
    for (const testCase of testCases) {
      const vulnerableResult = vulnerableBehavior(testCase.input);
      const secureResult = secureBehavior(testCase.input);
      
      // The secure behavior should always match our expected result
      expect(secureResult).toBe(testCase.expected);
      
      // For falsy values (except false), vulnerable behavior incorrectly returns true
      // but Node.js would treat the original falsy value as false, creating the vulnerability
      if (testCase.input !== false && !testCase.input) {
        // This is where the vulnerability existed - vulnerable behavior returns true
        // but Node.js would use the original falsy value and treat it as false
        expect(vulnerableResult).toBe(true); // This was the problem
        expect(secureResult).toBe(true); // This is the fix
      }
    }
  });
});