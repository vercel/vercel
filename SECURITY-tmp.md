# Security: tmp Package Vulnerability Mitigation

## Overview

This document outlines the security measures implemented to protect against a symbolic link vulnerability in the `tmp` package (CVE pending).

## Vulnerability Details

- **Affected versions**: `tmp@0.2.0` through `tmp@0.2.3`
- **Issue**: Arbitrary temporary file/directory write via symbolic link `dir` parameter
- **Description**: The `_resolvePath` function in affected versions does not properly handle symbolic links, allowing attackers to bypass the `_assertIsRelative` check and write files outside the intended temporary directory.

## Current Protection

### 1. Safe Version Usage
- **Current**: `tmp-promise@1.0.3` → `tmp@0.0.31` (predates vulnerability)
- **Status**: ✅ SAFE - The vulnerable code was introduced in tmp@0.2.x series
- **Verification**: Security tests confirm symbolic link attacks are properly rejected

### 2. Version Overrides
The root `package.json` includes pnpm overrides to prevent accidental installation of vulnerable versions:

```json
{
  "pnpm": {
    "overrides": {
      "tmp@>=0.2.0 <0.2.5": ">=0.2.5"
    }
  }
}
```

This ensures that if any dependency tries to install a vulnerable version of tmp (0.2.0-0.2.3), it will be upgraded to the fixed version (0.2.5+).

### 3. Security Tests
Comprehensive tests in `packages/cli/test/unit/util/tmp-security.test.ts` verify that:
- Symbolic link attacks are properly blocked
- Files cannot be created outside the intended temporary directory
- Proper error handling for malicious paths
- Current package versions are documented for security tracking

## Vulnerability Technical Details

### Vulnerable Code Pattern (tmp@0.2.3)
```javascript
function _resolvePath(name, tmpDir) {
  if (name.startsWith(tmpDir)) {
    return path.resolve(name);
  } else {
    return path.resolve(path.join(tmpDir, name));
  }
}
```

### Fixed Code Pattern (tmp@0.2.5+)
```javascript
function _resolvePathSync(name, tmpDir) {
  const pathToResolve = path.isAbsolute(name) ? name : path.join(tmpDir, name);
  try {
    fs.statSync(pathToResolve);
    return fs.realpathSync(pathToResolve); // ✅ Properly resolves symlinks
  } catch (_err) {
    const parentDir = fs.realpathSync(path.dirname(pathToResolve));
    return path.join(parentDir, path.basename(pathToResolve));
  }
}
```

## Attack Vector Example

1. Attacker creates a symbolic link inside the temporary directory pointing to a sensitive location outside:
   ```bash
   ln -s /etc/sensitive-config /tmp/evil-symlink
   ```

2. In vulnerable versions, calling `tmp.fileSync({ dir: 'evil-symlink' })` would:
   - Bypass the relative path check
   - Create files in `/etc/sensitive-config/` instead of the temp directory

3. In safe versions (0.0.31 or 0.2.5+):
   - The attack is blocked by proper symlink resolution
   - Error is thrown for paths outside the temp directory

## Recommendations

1. **Do not upgrade** tmp-promise beyond 1.0.3 without careful security review
2. **Monitor** for new tmp package releases and security advisories
3. **Test thoroughly** if upgrading tmp-related dependencies
4. **Keep the pnpm overrides** to prevent accidental vulnerable installations

## References

- [Original vulnerability report](https://github.com/raszi/node-tmp/issues/207)
- [tmp package documentation](https://github.com/raszi/node-tmp)
- [Security test file](./packages/cli/test/unit/util/tmp-security.test.ts)
