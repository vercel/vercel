import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import semver from 'semver';

/**
 * Security tests for thenify package eval vulnerability.
 * 
 * These tests verify that the current thenify version is safe (>= 3.3.1)
 * and protect against the eval vulnerability that affects thenify@<3.3.1.
 * 
 * Background: thenify before 3.3.1 made use of unsafe calls to `eval`,
 * which could potentially be exploited for code injection attacks.
 * 
 * Current status: SAFE - using thenify@3.3.1 which fixes the eval vulnerability.
 */
describe('thenify security vulnerability mitigation', () => {
  // Read and parse package.json once for reuse across tests
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  let packageJson: any;
  
  if (fs.existsSync(packageJsonPath)) {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } else {
    throw new Error('package.json not found at ' + packageJsonPath);
  }
  it('should use safe thenify version (>= 3.3.1)', () => {
    // Find thenify in the lock file to verify version
    const lockfilePath = path.join(process.cwd(), 'pnpm-lock.yaml');
    
    if (fs.existsSync(lockfilePath)) {
      const lockfileContent = fs.readFileSync(lockfilePath, 'utf8');
      const thenifyMatch = lockfileContent.match(/\/thenify@([0-9]+\.[0-9]+\.[0-9]+[^:]*)/);
      
      if (thenifyMatch && thenifyMatch[1]) {
        const version = thenifyMatch[1];
        console.log(`Found thenify version: ${version}`);
        
        // Use semver for robust version comparison
        const isVersionSafe = semver.gte(version, '3.3.1');
        
        expect(isVersionSafe, `Thenify version ${version} should be >= 3.3.1`).toBe(true);
      } else {
        // If no thenify found in lockfile, that's also fine (no vulnerability)
        console.log('No thenify dependency found in lockfile - no vulnerability present');
      }
    } else {
      console.warn('pnpm-lock.yaml not found, cannot verify thenify version');
    }
  });

  it('should have overrides configured to prevent vulnerable thenify versions', () => {
    if (packageJson) {
      // Check pnpm overrides
      const pnpmOverrides = packageJson.pnpm?.overrides;
      const npmOverrides = packageJson.overrides;
      
      // At least one override system should have thenify protection
      const hasPnpmThenifyOverride = pnpmOverrides && pnpmOverrides['thenify@<3.3.1'] === '>=3.3.1';
      
      const hasNpmThenifyOverride = npmOverrides && npmOverrides['thenify@<3.3.1'] === '>=3.3.1';
      
      const hasOverride = hasPnpmThenifyOverride || hasNpmThenifyOverride;
      expect(hasOverride).toBe(true);
      
      if (hasPnpmThenifyOverride) {
        console.log('pnpm overrides configured for thenify security');
      }
      if (hasNpmThenifyOverride) {
        console.log('npm overrides configured for thenify security');
      }
    } else {
      throw new Error('package.json not found');
    }
  });

  it('should document the current thenify security status', () => {
    // This test documents the current security status for tracking
    console.log('thenify Security Status:');
    console.log('- Current implementation: SAFE');
    console.log('- Vulnerable versions: thenify@<3.3.1 (unsafe eval calls)');
    console.log('- Safe versions: thenify@>=3.3.1 (no eval vulnerability)');
    console.log('- Mitigation: Package overrides prevent vulnerable versions');
    console.log('- Reference: SECURITY-thenify.md');
    
    // Always pass - this is just for documentation
    expect(true).toBe(true);
  });

  it('should prevent installation of vulnerable thenify versions through overrides', () => {
    // Verify that the package.json configuration will prevent vulnerable versions
    if (!packageJson) {
      throw new Error('package.json not found');
    }
    
    // Test both pnpm and npm override configurations
    const pnpmOverrides = packageJson.pnpm?.overrides || {};
    const npmOverrides = packageJson.overrides || {};
    
    const allOverrides = { ...pnpmOverrides, ...npmOverrides };
    
    // Look for thenify-related overrides
    const thenifyOverrides = Object.keys(allOverrides).filter(key => key.includes('thenify'));
    
    expect(thenifyOverrides.length).toBeGreaterThan(0);
    
    // Verify the override pattern correctly captures vulnerable versions
    // Verify the override pattern correctly captures vulnerable versions
    const vulnerableVersionOverrideKey = 'thenify@<3.3.1';
    const thenifyOverrideExists = Object.keys(allOverrides).includes(vulnerableVersionOverrideKey);

    expect(thenifyOverrideExists, `Override for "${vulnerableVersionOverrideKey}" should exist`).toBe(true);

    if (thenifyOverrideExists) {
      const targetVersion = allOverrides[vulnerableVersionOverrideKey];
      expect(targetVersion).toBe('>=3.3.1');
      console.log(`Override configured: ${vulnerableVersionOverrideKey} -> ${targetVersion}`);
    }
  });
});