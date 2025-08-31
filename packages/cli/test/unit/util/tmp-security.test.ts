import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
// @ts-ignore
import tmp from 'tmp-promise';

tmp.setGracefulCleanup();

/**
 * Security tests for tmp package symbolic link vulnerability.
 * 
 * These tests verify that the current tmp-promise@1.0.3 (which uses tmp@0.0.31)
 * is not vulnerable to the symbolic link attack that affects tmp@0.2.0-0.2.3.
 * 
 * Background: CVE pending for tmp@0.2.3 - Arbitrary temporary file/directory 
 * write via symbolic link dir parameter. The vulnerability allows bypassing
 * the _assertIsRelative check by using symlinks to write files outside tmpdir.
 * 
 * Current status: SAFE - using tmp@0.0.31 which predates the vulnerability.
 */
describe('tmp security vulnerability mitigation', () => {
  let testDir: string;
  let symlinkPath: string;
  let targetDir: string;

  afterEach(async () => {
    // Clean up test directories
    try {
      if (symlinkPath && (await fs.pathExists(symlinkPath))) {
        await fs.unlink(symlinkPath);
      }
      if (targetDir && (await fs.pathExists(targetDir))) {
        await fs.remove(targetDir);
      }
      if (testDir && (await fs.pathExists(testDir))) {
        await fs.remove(testDir);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should reject symbolic link attacks (verifies current tmp@0.0.31 behavior)', async () => {
    // Create a directory outside of tmp that we should NOT be able to write to
    targetDir = path.join(process.cwd(), 'test-security-target');
    await fs.ensureDir(targetDir);

    // Create our own temp directory to test with
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'vercel-security-test-'));
    
    // Create a symlink inside the temp directory that points outside of it
    symlinkPath = path.join(testDir, 'evil-dir');
    await fs.symlink(targetDir, symlinkPath);

    // Verify the symlink was created correctly
    expect(await fs.pathExists(symlinkPath)).toBe(true);
    const symlinkStat = await fs.lstat(symlinkPath);
    expect(symlinkStat.isSymbolicLink()).toBe(true);

    // Try to create a file using the symlink as the dir option
    // The current implementation (tmp@0.0.31) should handle this safely
    
    let tmpFile: any;
    let errorThrown = false;
    
    try {
      tmpFile = tmp.fileSync({ 
        dir: path.relative(testDir, symlinkPath),
        tmpdir: testDir 
      });
      
      // If file was created, ensure it's not in the target directory
      if (tmpFile && tmpFile.name) {
        const createdFilePath = tmpFile.name;
        const normalizedPath = path.resolve(createdFilePath);
        const normalizedTargetDir = path.resolve(targetDir);
        
        // The created file should NOT be inside the target directory
        expect(normalizedPath.startsWith(normalizedTargetDir)).toBe(false);
        
        // The created file should be inside the test temp directory or system temp
        const normalizedTestDir = path.resolve(testDir);
        const normalizedSystemTmp = path.resolve(tmpdir());
        const isInTestDir = normalizedPath.startsWith(normalizedTestDir);
        const isInSystemTmp = normalizedPath.startsWith(normalizedSystemTmp);
        
        expect(isInTestDir || isInSystemTmp).toBe(true);
      }
    } catch (error: any) {
      // If an error is thrown, that's actually good security behavior
      errorThrown = true;
      // Common error patterns for blocked symlink attacks
      expect(error.message).toMatch(/ENOENT|no such file|directory|tmpdir|relative/i);
    } finally {
      if (tmpFile && tmpFile.removeCallback) {
        tmpFile.removeCallback();
      }
    }

    // Check that no files were created in the target directory
    const targetFiles = await fs.readdir(targetDir);
    expect(targetFiles.length).toBe(0);
    
    // Document what we observed
    console.log(`Test result: ${errorThrown ? 'Error thrown (secure)' : 'File created safely'}`);
  });

  it('should allow valid symlinks within tmpdir', async () => {
    // Create a directory inside tmpdir
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'vercel-security-test-'));
    const innerDir = path.join(testDir, 'inner');
    await fs.ensureDir(innerDir);
    
    // Create a symlink that points to a valid directory inside tmpdir
    symlinkPath = path.join(testDir, 'valid-link');
    await fs.symlink(innerDir, symlinkPath);
    
    // This should work fine since the symlink resolves to a valid path inside tmpdir
    const tmpFile = tmp.fileSync({ 
      dir: path.relative(testDir, symlinkPath),
      tmpdir: testDir 
    });
    
    expect(tmpFile.name).toBeDefined();
    expect(path.resolve(tmpFile.name).startsWith(path.resolve(testDir))).toBe(true);
    
    tmpFile.removeCallback();
  });

  it('should document the current tmp package versions', () => {
    // This test documents the current package versions for security tracking
    const tmpPromiseVersion = require('tmp-promise/package.json').version;
    
    // We expect to be using the safe tmp-promise version
    expect(tmpPromiseVersion).toBe('1.0.3');
    
    console.log(`Current tmp-promise version: ${tmpPromiseVersion}`);
    console.log('This version uses tmp@0.0.31, which predates the CVE vulnerability in tmp@0.2.0-0.2.3');
  });
});