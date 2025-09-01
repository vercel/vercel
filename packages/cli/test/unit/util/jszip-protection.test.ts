import { describe, it, expect, vi } from 'vitest';
import {
  secureLoadAsync,
  createSecureJSZip,
  validateLoadedJSZip,
  secureGetFile,
  secureForEach,
  JSZIP_SECURITY_ANTIPATTERNS
} from '../../../src/util/security/jszip-protection';

// Mock JSZip-like object for testing
const createMockJSZip = (files: Record<string, any>) => ({
  files,
  loadAsync: vi.fn().mockResolvedValue({ files }),
  forEach: vi.fn((callback: (path: string, file: any) => void) => {
    Object.keys(files).forEach(path => callback(path, files[path]));
  }),
  file: vi.fn((path: string) => files[path]),
  folder: vi.fn((name: string) => null)
});

describe('jszip-protection', () => {
  const testExtractionPath = '/tmp/safe-extraction';

  describe('secureLoadAsync', () => {
    it('should load and validate safe zip files', async () => {
      const safeFiles = {
        'file1.txt': { content: 'safe' },
        'folder/file2.txt': { content: 'safe' },
        'deep/nested/file3.txt': { content: 'safe' }
      };

      const MockJSZip = {
        loadAsync: vi.fn().mockResolvedValue({ files: safeFiles })
      };

      const result = await secureLoadAsync(MockJSZip, Buffer.from('zip data'), testExtractionPath);
      
      expect(MockJSZip.loadAsync).toHaveBeenCalledWith(Buffer.from('zip data'), undefined);
      expect(result.files).toEqual(safeFiles);
    });

    it('should reject zip files with malicious paths', async () => {
      const maliciousFiles = {
        'safe.txt': { content: 'safe' },
        '../../../evil.txt': { content: 'malicious' }
      };

      const MockJSZip = {
        loadAsync: vi.fn().mockResolvedValue({ files: maliciousFiles })
      };

      await expect(secureLoadAsync(MockJSZip, Buffer.from('zip data'), testExtractionPath))
        .rejects.toThrow('JSZip loadAsync security violation');
    });

    it('should pass through JSZip options', async () => {
      const safeFiles = { 'file.txt': { content: 'safe' } };
      const options = { base64: true };

      const MockJSZip = {
        loadAsync: vi.fn().mockResolvedValue({ files: safeFiles })
      };

      await secureLoadAsync(MockJSZip, 'base64data', testExtractionPath, options);
      
      expect(MockJSZip.loadAsync).toHaveBeenCalledWith('base64data', options);
    });
  });

  describe('createSecureJSZip', () => {
    it('should create a wrapper with secure loadAsync', async () => {
      const safeFiles = { 'file.txt': { content: 'safe' } };
      
      const MockJSZip = {
        loadAsync: vi.fn().mockResolvedValue({ files: safeFiles })
      };

      const secureWrapper = createSecureJSZip(MockJSZip, testExtractionPath);
      
      const result = await secureWrapper.loadAsync(Buffer.from('zip data'));
      expect(result.files).toEqual(safeFiles);
    });

    it('should reject malicious content through wrapper', async () => {
      const maliciousFiles = {
        'good.txt': { content: 'safe' },
        '/etc/passwd': { content: 'malicious' }
      };
      
      const MockJSZip = {
        loadAsync: vi.fn().mockResolvedValue({ files: maliciousFiles })
      };

      const secureWrapper = createSecureJSZip(MockJSZip, testExtractionPath);
      
      await expect(secureWrapper.loadAsync(Buffer.from('zip data')))
        .rejects.toThrow('JSZip loadAsync security violation');
    });
  });

  describe('validateLoadedJSZip', () => {
    it('should validate safe zip objects', () => {
      const safeZip = createMockJSZip({
        'file1.txt': { content: 'safe' },
        'folder/file2.txt': { content: 'safe' }
      });

      expect(() => validateLoadedJSZip(safeZip, testExtractionPath)).not.toThrow();
    });

    it('should reject unsafe zip objects', () => {
      const unsafeZip = createMockJSZip({
        'safe.txt': { content: 'safe' },
        '../../unsafe.txt': { content: 'malicious' }
      });

      expect(() => validateLoadedJSZip(unsafeZip, testExtractionPath))
        .toThrow('JSZip loadAsync security violation');
    });
  });

  describe('secureGetFile', () => {
    it('should return file for safe paths', () => {
      const mockZip = createMockJSZip({
        'safe.txt': { content: 'file content' }
      });

      const result = secureGetFile(mockZip, 'safe.txt', testExtractionPath);
      
      expect(result).toEqual({ content: 'file content' });
      expect(mockZip.file).toHaveBeenCalledWith('safe.txt');
    });

    it('should reject unsafe paths', () => {
      const mockZip = createMockJSZip({
        '../unsafe.txt': { content: 'malicious' }
      });

      expect(() => secureGetFile(mockZip, '../unsafe.txt', testExtractionPath))
        .toThrow('JSZip security violation');
      
      expect(mockZip.file).not.toHaveBeenCalled();
    });

    it('should handle absolute paths', () => {
      const mockZip = createMockJSZip({
        '/etc/passwd': { content: 'malicious' }
      });

      expect(() => secureGetFile(mockZip, '/etc/passwd', testExtractionPath))
        .toThrow('JSZip security violation');
    });
  });

  describe('secureForEach', () => {
    it('should iterate over safe files only', () => {
      const safeFiles = {
        'file1.txt': { content: 'safe1' },
        'folder/file2.txt': { content: 'safe2' }
      };
      
      const mockZip = createMockJSZip(safeFiles);
      const callback = vi.fn();

      secureForEach(mockZip, testExtractionPath, callback);
      
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith('file1.txt', safeFiles['file1.txt']);
      expect(callback).toHaveBeenCalledWith('folder/file2.txt', safeFiles['folder/file2.txt']);
    });

    it('should throw on first unsafe path encountered', () => {
      const mixedFiles = {
        'safe.txt': { content: 'safe' },
        '../unsafe.txt': { content: 'malicious' },
        'another-safe.txt': { content: 'safe' }
      };
      
      const mockZip = createMockJSZip(mixedFiles);
      const callback = vi.fn();

      expect(() => secureForEach(mockZip, testExtractionPath, callback))
        .toThrow('JSZip security violation');
    });

    it('should call callback for safe files before throwing on an unsafe path', () => {
      const mixedFiles = {
        'safe.txt': { content: 'safe' },
        '../../evil.txt': { content: 'malicious' }
      };
      
      // Create a mock that calls callback for safe.txt first, then the unsafe path
      const mockZip = {
        files: mixedFiles,
        forEach: vi.fn((callback: (path: string, file: any) => void) => {
          callback('safe.txt', mixedFiles['safe.txt']);
          callback('../../evil.txt', mixedFiles['../../evil.txt']);
        }),
        file: vi.fn(),
        folder: vi.fn()
      };
      
      const callback = vi.fn();

      expect(() => secureForEach(mockZip, testExtractionPath, callback))
        .toThrow('JSZip security violation');
      
      // Callback should have been called once for the safe file before the error
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('safe.txt', mixedFiles['safe.txt']);
    });
  });

  describe('security documentation', () => {
    it('should provide anti-patterns list', () => {
      expect(JSZIP_SECURITY_ANTIPATTERNS).toBeDefined();
      expect(JSZIP_SECURITY_ANTIPATTERNS.length).toBeGreaterThan(0);
      expect(JSZIP_SECURITY_ANTIPATTERNS[0]).toContain('loadAsync');
    });

    it('should have immutable anti-patterns', () => {
      expect(() => {
        // @ts-expect-error Testing immutability
        JSZIP_SECURITY_ANTIPATTERNS.push('new antipattern');
      }).toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty zip files', () => {
      const emptyZip = createMockJSZip({});
      
      expect(() => validateLoadedJSZip(emptyZip, testExtractionPath)).not.toThrow();
      
      const callback = vi.fn();
      secureForEach(emptyZip, testExtractionPath, callback);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle zip files with only directories', () => {
      const dirOnlyFiles = {
        'folder/': { dir: true },
        'nested/folder/': { dir: true }
      };
      
      const mockZip = createMockJSZip(dirOnlyFiles);
      
      expect(() => validateLoadedJSZip(mockZip, testExtractionPath)).not.toThrow();
    });

    it('should handle special characters in safe paths', () => {
      const specialFiles = {
        'file with spaces.txt': { content: 'safe' },
        'file-with-dashes.txt': { content: 'safe' },
        'file_with_underscores.txt': { content: 'safe' },
        'file.with.dots.txt': { content: 'safe' }
      };
      
      const mockZip = createMockJSZip(specialFiles);
      
      expect(() => validateLoadedJSZip(mockZip, testExtractionPath)).not.toThrow();
    });

    it('should handle Unicode filenames safely', () => {
      const unicodeFiles = {
        'файл.txt': { content: 'Cyrillic filename' },
        '文件.txt': { content: 'Chinese filename' },
        'ファイル.txt': { content: 'Japanese filename' },
        'café.txt': { content: 'Accented filename' }
      };
      
      const mockZip = createMockJSZip(unicodeFiles);
      
      expect(() => validateLoadedJSZip(mockZip, testExtractionPath)).not.toThrow();
    });
  });
});