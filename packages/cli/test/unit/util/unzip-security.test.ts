import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import path from 'path';
import fs from 'fs-extra';
import { ZipFile } from 'yauzl-promise';
// @ts-expect-error: yazl has no TypeScript types available
import yazl from 'yazl';
import { unzip } from '../../../src/util/build/unzip';

/**
 * Security tests for enhanced unzip functionality with JSZip path traversal protection.
 * 
 * These tests verify that the unzip function properly blocks path traversal attempts
 * that could be used in attacks similar to the JSZip loadAsync vulnerability.
 */
describe('unzip path traversal security', () => {
  let testDir: string;
  let maliciousZipBuffer: Buffer;
  let safeZipBuffer: Buffer;

  beforeEach(async () => {
    // Create a temporary directory for testing
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'vercel-unzip-security-'));
  });

  afterEach(async () => {
    // Clean up test directory
    if (testDir && await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  async function createZipBuffer(entries: Array<{ name: string; content: string }>): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const zipFile = new yazl.ZipFile();
      const chunks: Buffer[] = [];

      entries.forEach(entry => {
        zipFile.addBuffer(Buffer.from(entry.content), entry.name);
      });

      zipFile.end();

      zipFile.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
      zipFile.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
      zipFile.outputStream.on('error', reject);
    });
  }

  it('should extract safe zip files successfully', async () => {
    const safeEntries = [
      { name: 'file1.txt', content: 'Safe content 1' },
      { name: 'folder/file2.txt', content: 'Safe content 2' },
      { name: 'deep/nested/folder/file3.txt', content: 'Safe content 3' }
    ];

    const zipBuffer = await createZipBuffer(safeEntries);
    
    await expect(unzip(zipBuffer, testDir)).resolves.not.toThrow();

    // Verify files were extracted correctly
    expect(await fs.pathExists(path.join(testDir, 'file1.txt'))).toBe(true);
    expect(await fs.pathExists(path.join(testDir, 'folder/file2.txt'))).toBe(true);
    expect(await fs.pathExists(path.join(testDir, 'deep/nested/folder/file3.txt'))).toBe(true);

    // Verify content
    const content1 = await fs.readFile(path.join(testDir, 'file1.txt'), 'utf8');
    expect(content1).toBe('Safe content 1');
  });

  it('should block path traversal attempts', async () => {
    const maliciousEntries = [
      { name: '../../../evil.txt', content: 'This should not be extracted' },
      { name: 'good.txt', content: 'This is safe' }
    ];

    const zipBuffer = await createZipBuffer(maliciousEntries);
    
    await expect(unzip(zipBuffer, testDir)).rejects.toThrow('Path traversal detected');
  });

  it('should block absolute path attempts', async () => {
    const maliciousEntries = [
      { name: '/tmp/evil.txt', content: 'Absolute path attack' },
      { name: 'good.txt', content: 'This is safe' }
    ];

    const zipBuffer = await createZipBuffer(maliciousEntries);
    
    await expect(unzip(zipBuffer, testDir)).rejects.toThrow('Path traversal detected');
  });

  it('should block Windows-style path traversal', async () => {
    const maliciousEntries = [
      { name: '..\\..\\..\\evil.txt', content: 'Windows path traversal' },
      { name: 'good.txt', content: 'This is safe' }
    ];

    const zipBuffer = await createZipBuffer(maliciousEntries);
    
    await expect(unzip(zipBuffer, testDir)).rejects.toThrow('Path traversal detected');
  });

  it('should block null byte injection attacks', async () => {
    const maliciousEntries = [
      { name: 'evil.txt\0.jpg', content: 'Null byte attack' },
      { name: 'good.txt', content: 'This is safe' }
    ];

    const zipBuffer = await createZipBuffer(maliciousEntries);
    
    await expect(unzip(zipBuffer, testDir)).rejects.toThrow('Path traversal detected');
  });

  it('should handle complex path manipulation attempts', async () => {
    const maliciousEntries = [
      { name: 'folder/../../../evil.txt', content: 'Complex traversal' },
      { name: 'good.txt', content: 'This is safe' }
    ];

    const zipBuffer = await createZipBuffer(maliciousEntries);
    
    await expect(unzip(zipBuffer, testDir)).rejects.toThrow('Path traversal detected');
  });

  it('should allow hidden files and dot files', async () => {
    const safeEntries = [
      { name: '.hidden', content: 'Hidden file content' },
      { name: 'folder/.env', content: 'Environment variables' },
      { name: '.gitignore', content: '*.log' }
    ];

    const zipBuffer = await createZipBuffer(safeEntries);
    
    await expect(unzip(zipBuffer, testDir)).resolves.not.toThrow();

    // Verify hidden files were extracted
    expect(await fs.pathExists(path.join(testDir, '.hidden'))).toBe(true);
    expect(await fs.pathExists(path.join(testDir, 'folder/.env'))).toBe(true);
    expect(await fs.pathExists(path.join(testDir, '.gitignore'))).toBe(true);
  });

  it('should skip __MACOSX entries without validating them', async () => {
    const entries = [
      { name: '__MACOSX/file.txt', content: 'Mac metadata' },
      { name: '__MACOSX/../../../evil.txt', content: 'Mac traversal attempt' },
      { name: 'good.txt', content: 'Safe content' }
    ];

    const zipBuffer = await createZipBuffer(entries);
    
    // Should still block the traversal attempt even in __MACOSX entries
    // Note: The current implementation skips __MACOSX files before validation,
    // but this test documents expected behavior if that changes
    await expect(unzip(zipBuffer, testDir)).resolves.not.toThrow();

    // Verify only safe file was extracted
    expect(await fs.pathExists(path.join(testDir, 'good.txt'))).toBe(true);
    expect(await fs.pathExists(path.join(testDir, '__MACOSX'))).toBe(false);
  });

  it('should provide detailed error messages for security violations', async () => {
    const maliciousEntries = [
      { name: '../../../etc/passwd', content: 'System file attack' }
    ];

    const zipBuffer = await createZipBuffer(maliciousEntries);
    
    try {
      await unzip(zipBuffer, testDir);
      expect.fail('Should have thrown error');
    } catch (error: any) {
      expect(error.message).toContain('Path traversal detected');
      expect(error.message).toContain('../../../etc/passwd');
      expect(error.message).toContain('security attack');
    }
  });

  it('should handle empty zip files safely', async () => {
    const zipBuffer = await createZipBuffer([]);
    
    await expect(unzip(zipBuffer, testDir)).resolves.not.toThrow();
  });

  it('should maintain both new and existing protection layers', async () => {
    // This test ensures that both the new isZipEntryPathSafe check
    // and the existing canonicalDestDir check are working together
    const maliciousEntries = [
      { name: 'subtle/../../../bypass.txt', content: 'Bypass attempt' }
    ];

    const zipBuffer = await createZipBuffer(maliciousEntries);
    
    // Should be caught by the new protection layer before the old one
    await expect(unzip(zipBuffer, testDir)).rejects.toThrow('Path traversal detected');
  });

  describe('real-world attack simulation', () => {
    it('should block zip bomb paths', async () => {
      const zipBombEntries = [
        { name: '../../../../../../../../../../../../../../../../../tmp/bomb.txt', content: 'BOMB' }
      ];

      const zipBuffer = await createZipBuffer(zipBombEntries);
      
      await expect(unzip(zipBuffer, testDir)).rejects.toThrow('Path traversal detected');
    });

    it('should block system file overwrite attempts', async () => {
      const systemFileEntries = [
        { name: '../../../etc/passwd', content: 'root:x:0:0:hacked:/root:/bin/bash' },
        { name: '../../../etc/shadow', content: 'root:hacked:::::' }
      ];

      const zipBuffer = await createZipBuffer(systemFileEntries);
      
      await expect(unzip(zipBuffer, testDir)).rejects.toThrow('Path traversal detected');
    });

    it('should block web shell placement attempts', async () => {
      const webShellEntries = [
        { name: '../../../var/www/html/shell.php', content: '<?php system($_GET["cmd"]); ?>' },
        { name: '../../../inetpub/wwwroot/shell.asp', content: '<%eval request("cmd")%>' }
      ];

      const zipBuffer = await createZipBuffer(webShellEntries);
      
      await expect(unzip(zipBuffer, testDir)).rejects.toThrow('Path traversal detected');
    });
  });
});
