# Security: JSZip Path Traversal Protection

## Overview

This document outlines the security measures implemented to protect against JSZip path traversal vulnerabilities, specifically the `loadAsync` method vulnerability that allows malicious zip files to extract files outside the intended directory.

## Vulnerability Details

- **Affected library**: JSZip (multiple versions)
- **Attack vector**: Path traversal via malicious zip entry names
- **Description**: JSZip's `loadAsync` method can process zip files containing entries with path traversal sequences (`../`, `..\\`, absolute paths) that allow attackers to write files outside the intended extraction directory.

## Current Protection

### 1. Path Validation Utility

**File**: `packages/cli/src/util/security/zip-path-validator.ts`

Provides comprehensive path validation functions:
- `isZipEntryPathSafe()` - Validates individual entry paths
- `validateJSZipEntries()` - Validates entire zip file contents
- `validateAndResolveZipEntryPath()` - Safe path resolution
- `containsSuspiciousPatterns()` - Pattern-based detection

### 2. JSZip Protection Wrapper

**File**: `packages/cli/src/util/security/jszip-protection.ts`

Provides secure wrappers for JSZip operations:
- `secureLoadAsync()` - Secure replacement for JSZip.loadAsync()
- `createSecureJSZip()` - Factory for secure JSZip instances
- `secureGetFile()` - Safe file retrieval
- `secureForEach()` - Safe iteration over zip entries

### 3. Enhanced Unzip Protection

**File**: `packages/cli/src/util/build/unzip.ts`

The existing unzip utility has been enhanced with the new path validation:
- Pre-extraction path validation using `isZipEntryPathSafe()`
- Maintains existing canonical path checks as additional protection
- Provides detailed error messages for security violations

### 4. Comprehensive Testing

**Files**: 
- `packages/cli/test/unit/util/zip-path-validator.test.ts`
- `packages/cli/test/unit/util/jszip-protection.test.ts`
- `packages/cli/test/unit/util/unzip-security.test.ts`

Tests cover:
- All known path traversal attack patterns
- Cross-platform compatibility (Windows/Unix paths)
- Real-world attack scenarios
- Edge cases and Unicode handling

## Attack Vector Examples

### Path Traversal Patterns Blocked

```
../../../etc/passwd          # Unix-style traversal
..\\..\\..\\Windows\\System32 # Windows-style traversal
/absolute/path/attack        # Absolute path
folder/../../../escape.txt   # Traversal in path middle
file\0.txt                   # Null byte injection
```

### Real-World Attack Scenarios

```
# System file overwrite
../../../etc/passwd
../../../etc/shadow

# Web shell placement
../../../var/www/html/shell.php
../../../inetpub/wwwroot/shell.asp

# Configuration tampering
../../../home/user/.ssh/authorized_keys
../../../etc/crontab
```

## Usage Guidelines

### For JSZip Usage (Recommended)

```typescript
import JSZip from 'jszip';
import { secureLoadAsync } from '@/util/security/jszip-protection';

// Instead of: const zip = await JSZip.loadAsync(buffer);
const zip = await secureLoadAsync(JSZip, buffer, extractionPath);
```

### For Custom Zip Handling

```typescript
import { isZipEntryPathSafe } from '@/util/security/zip-path-validator';

// Validate each entry before processing
for (const entryName of zipEntryNames) {
  if (!isZipEntryPathSafe(entryName, baseExtractionPath)) {
    throw new Error(`Unsafe path detected: ${entryName}`);
  }
  // Safe to process entry
}
```

### Anti-Patterns to Avoid

- Direct `JSZip.loadAsync()` without validation
- Trusting zip entry names as safe file paths
- Using `zip.file()` with user-controlled paths
- Extracting without path validation

## Protection Layers

1. **Input Validation**: Entry paths checked before processing
2. **Path Resolution**: Safe resolution within extraction directory
3. **Pattern Detection**: Known malicious patterns blocked
4. **Canonical Path Verification**: Additional filesystem-level checks
5. **Error Handling**: Detailed security violation reporting

## Testing

Run security tests:
```bash
pnpm test packages/cli/test/unit/util/zip-path-validator.test.ts
pnpm test packages/cli/test/unit/util/jszip-protection.test.ts
pnpm test packages/cli/test/unit/util/unzip-security.test.ts
```

## References

- [OWASP Path Traversal Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Path_Traversal_Cheat_Sheet.html)
- [JSZip Security Considerations](https://stuk.github.io/jszip/)
- [ZIP File Path Traversal Vulnerability Research](https://snyk.io/research/zip-slip-vulnerability)

## Version History

- **Current**: Comprehensive JSZip path traversal protection implemented
- **Enhanced**: Added multi-layer validation and secure wrappers
- **Testing**: Full test coverage for attack scenarios and edge cases