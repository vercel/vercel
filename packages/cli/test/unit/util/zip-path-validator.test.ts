import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  isZipEntryPathSafe,
  validateAndResolveZipEntryPath,
  validateJSZipEntries,
  containsSuspiciousPatterns,
  SUSPICIOUS_PATH_PATTERNS
} from '../../../src/util/security/zip-path-validator';

describe('zip-path-validator security', () => {
  const testBaseDir = '/tmp/safe-extraction';

  describe('isZipEntryPathSafe', () => {
    it('should allow safe relative paths', () => {
      expect(isZipEntryPathSafe('file.txt', testBaseDir)).toBe(true);
      expect(isZipEntryPathSafe('folder/file.txt', testBaseDir)).toBe(true);
      expect(isZipEntryPathSafe('deep/nested/folder/file.txt', testBaseDir)).toBe(true);
    });

    it('should block path traversal attempts', () => {
      // Classic path traversal
      expect(isZipEntryPathSafe('../file.txt', testBaseDir)).toBe(false);
      expect(isZipEntryPathSafe('../../file.txt', testBaseDir)).toBe(false);
      expect(isZipEntryPathSafe('../../../etc/passwd', testBaseDir)).toBe(false);
      
      // Path traversal in middle of path
      expect(isZipEntryPathSafe('folder/../../../file.txt', testBaseDir)).toBe(false);
      expect(isZipEntryPathSafe('good/folder/../../../evil.txt', testBaseDir)).toBe(false);
      
      // Windows-style path traversal
      expect(isZipEntryPathSafe('..\\file.txt', testBaseDir)).toBe(false);
      expect(isZipEntryPathSafe('folder\\..\\..\\file.txt', testBaseDir)).toBe(false);
    });

    it('should block absolute paths', () => {
      expect(isZipEntryPathSafe('/etc/passwd', testBaseDir)).toBe(false);
      expect(isZipEntryPathSafe('/tmp/evil.txt', testBaseDir)).toBe(false);
      expect(isZipEntryPathSafe('C:\\Windows\\System32\\evil.exe', testBaseDir)).toBe(false);
      expect(isZipEntryPathSafe('D:\\Program Files\\evil.exe', testBaseDir)).toBe(false);
    });

    it('should block null byte injection', () => {
      expect(isZipEntryPathSafe('file.txt\0.jpg', testBaseDir)).toBe(false);
      expect(isZipEntryPathSafe('folder/file\0', testBaseDir)).toBe(false);
    });

    it('should handle edge cases', () => {
      // Empty strings should be safe (though unusual)
      expect(isZipEntryPathSafe('', testBaseDir)).toBe(true);
      
      // Single dot should be safe
      expect(isZipEntryPathSafe('.', testBaseDir)).toBe(true);
      expect(isZipEntryPathSafe('./file.txt', testBaseDir)).toBe(true);
      
      // Hidden files should be safe
      expect(isZipEntryPathSafe('.hidden', testBaseDir)).toBe(true);
      expect(isZipEntryPathSafe('folder/.hidden', testBaseDir)).toBe(true);
    });
  });

  describe('validateAndResolveZipEntryPath', () => {
    it('should resolve safe paths correctly', () => {
      const resolved = validateAndResolveZipEntryPath('file.txt', testBaseDir);
      expect(resolved).toBe(path.resolve(testBaseDir, 'file.txt'));
    });

    it('should throw error for unsafe paths', () => {
      expect(() => validateAndResolveZipEntryPath('../evil.txt', testBaseDir))
        .toThrow('Unsafe zip entry path detected');
      
      expect(() => validateAndResolveZipEntryPath('/etc/passwd', testBaseDir))
        .toThrow('Unsafe zip entry path detected');
        
      expect(() => validateAndResolveZipEntryPath('file\0.txt', testBaseDir))
        .toThrow('Unsafe zip entry path detected');
    });
  });

  describe('validateJSZipEntries', () => {
    it('should validate safe zip entries object', () => {
      const safeEntries = {
        'file1.txt': {},
        'folder/file2.txt': {},
        'deep/nested/file3.txt': {}
      };
      
      expect(() => validateJSZipEntries(safeEntries, testBaseDir)).not.toThrow();
    });

    it('should throw for malicious zip entries', () => {
      const maliciousEntries = {
        'file1.txt': {},
        '../../../etc/passwd': {},
        'folder/file2.txt': {}
      };
      
      expect(() => validateJSZipEntries(maliciousEntries, testBaseDir))
        .toThrow('JSZip loadAsync security violation');
    });

    it('should handle empty entries object', () => {
      expect(() => validateJSZipEntries({}, testBaseDir)).not.toThrow();
    });
  });

  describe('containsSuspiciousPatterns', () => {
    it('should detect suspicious path patterns', () => {
      expect(containsSuspiciousPatterns('../file.txt')).toBe(true);
      expect(containsSuspiciousPatterns('..\\file.txt')).toBe(true);
      expect(containsSuspiciousPatterns('/absolute/path')).toBe(true);
      expect(containsSuspiciousPatterns('\\absolute\\path')).toBe(true);
      expect(containsSuspiciousPatterns('C:\\Windows\\System32')).toBe(true);
      expect(containsSuspiciousPatterns('D:\\Program Files\\app.exe')).toBe(true);
      expect(containsSuspiciousPatterns('file\0.txt')).toBe(true);
      expect(containsSuspiciousPatterns('folder/../evil.txt')).toBe(true);
      expect(containsSuspiciousPatterns('folder\\..\\evil.txt')).toBe(true);
    });

    it('should not flag safe patterns', () => {
      expect(containsSuspiciousPatterns('file.txt')).toBe(false);
      expect(containsSuspiciousPatterns('folder/file.txt')).toBe(false);
      expect(containsSuspiciousPatterns('.hidden')).toBe(false);
      expect(containsSuspiciousPatterns('./file.txt')).toBe(false);
    });
  });

  describe('SUSPICIOUS_PATH_PATTERNS', () => {
    it('should have expected pattern count', () => {
      expect(SUSPICIOUS_PATH_PATTERNS.length).toBe(6);
    });

    it('should be read-only', () => {
      expect(() => {
        // @ts-expect-error Testing immutability
        SUSPICIOUS_PATH_PATTERNS.push(/test/);
      }).toThrow();
    });
  });

  describe('real-world attack scenarios', () => {
    it('should block zip bomb attempts via path traversal', () => {
      const zipBombPaths = [
        '../../../../../../../../../../../../../../../tmp/zipbomb.txt',
        '..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\tmp\\zipbomb.txt',
        '/tmp/zipbomb.txt',
        'C:\\temp\\zipbomb.txt'
      ];

      zipBombPaths.forEach(maliciousPath => {
        expect(isZipEntryPathSafe(maliciousPath, testBaseDir)).toBe(false);
      });
    });

    it('should block attempts to overwrite system files', () => {
      const systemFilePaths = [
        '../../../etc/passwd',
        '../../../etc/shadow',
        '..\\..\\..\\Windows\\System32\\config\\SAM',
        '/etc/passwd',
        'C:\\Windows\\System32\\drivers\\etc\\hosts'
      ];

      systemFilePaths.forEach(maliciousPath => {
        expect(isZipEntryPathSafe(maliciousPath, testBaseDir)).toBe(false);
      });
    });

    it('should block web application attacks', () => {
      const webAttackPaths = [
        '../../../var/www/html/shell.php',
        '..\\..\\..\\inetpub\\wwwroot\\shell.asp',
        '../../../home/user/.ssh/authorized_keys'
      ];

      webAttackPaths.forEach(maliciousPath => {
        expect(isZipEntryPathSafe(maliciousPath, testBaseDir)).toBe(false);
      });
    });

    it('should handle complex path manipulation attempts', () => {
      const complexAttacks = [
        'good/folder/../../../../../../evil.txt',
        'normal/path/../../../../../../../../../etc/passwd',
        'folder/./../../../sensitive.txt',
        'deeply/nested/path/../../../../../../../../../tmp/escape.txt'
      ];

      complexAttacks.forEach(maliciousPath => {
        expect(isZipEntryPathSafe(maliciousPath, testBaseDir)).toBe(false);
      });
    });
  });

  describe('cross-platform compatibility', () => {
    it('should handle both Unix and Windows path separators', () => {
      // Unix-style attacks
      expect(isZipEntryPathSafe('../unix/attack', testBaseDir)).toBe(false);
      expect(isZipEntryPathSafe('folder/../unix', testBaseDir)).toBe(false);
      
      // Windows-style attacks  
      expect(isZipEntryPathSafe('..\\windows\\attack', testBaseDir)).toBe(false);
      expect(isZipEntryPathSafe('folder\\..\\windows', testBaseDir)).toBe(false);
      
      // Mixed separators
      expect(isZipEntryPathSafe('../folder\\..\\mixed', testBaseDir)).toBe(false);
      expect(isZipEntryPathSafe('folder\\../mixed', testBaseDir)).toBe(false);
    });

    it('should normalize paths correctly on current platform', () => {
      const safePath = 'folder/subfolder/file.txt';
      const resolved = validateAndResolveZipEntryPath(safePath, testBaseDir);
      
      // Should be absolute and within base directory
      expect(path.isAbsolute(resolved)).toBe(true);
      expect(resolved.startsWith(path.resolve(testBaseDir))).toBe(true);
    });
  });
});