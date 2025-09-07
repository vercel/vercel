# Security: marked Package ReDoS Vulnerability Mitigation

## Overview

This document outlines the security measures implemented to protect against a Regular expression Denial of Service (ReDoS) vulnerability in the `marked` package.

## Vulnerability Details

- **Affected versions**: `marked@<4.0.10` 
- **Issue**: ReDoS (Regular expression Denial of Service) in block definition parsing
- **CVE**: Not assigned yet
- **Description**: The regular expression `block.def` may cause catastrophic backtracking against certain malicious strings, leading to denial of service attacks.

## Current Protection

### 1. Safe Version Usage
- **Current Production**: Most packages use `marked@4.3.0` which is safe (>= 4.0.10)
- **Status**: ✅ MOSTLY SAFE - Production code uses safe versions
- **Verification**: Security tests confirm ReDoS vulnerability is mitigated in safe versions

### 2. Version Overrides
The root `package.json` includes package overrides for both npm and pnpm to prevent installation of vulnerable versions:

```json
{
  "pnpm": {
    "overrides": {
      "marked@<4.0.10": ">=4.0.10"
    }
  },
  "overrides": {
    "marked@<4.0.10": ">=4.0.10"
  }
}
```

This ensures that if any dependency tries to install a vulnerable version of marked (<4.0.10), it will be upgraded to a safe version (4.0.10+) regardless of whether npm or pnpm is used.

### 3. Security Tests
Comprehensive tests in `packages/cli/test/unit/util/marked-security.test.ts` verify that:
- ReDoS attacks are properly blocked in current versions
- Malicious markdown cannot cause performance degradation
- Current package versions are documented for security tracking

## Vulnerability Technical Details

### Attack Vector
The vulnerability can be exploited using malicious markdown like:
```javascript
import * as marked from "marked";
marked.parse(`[x]:${' '.repeat(1500)}x ${' '.repeat(1500)} x`);
```

### Vulnerable Pattern (marked@<4.0.10)
The regular expression `block.def` in vulnerable versions causes catastrophic backtracking when processing:
- Reference-style link definitions with excessive whitespace
- Malformed link definitions that trigger worst-case regex performance

### Fixed Pattern (marked@>=4.0.10)
Version 4.0.10 and later:
- ✅ Improved regular expressions that avoid catastrophic backtracking
- ✅ Better input validation and parsing limits
- ✅ Performance optimizations for edge cases

## Attack Vector Prevention

The vulnerability could be exploited if:
1. Untrusted markdown content is processed by marked
2. The malicious content contains specially crafted link definitions
3. The vulnerable version processes this content without time limits

With version 4.0.10+:
- Malicious patterns are parsed efficiently without performance degradation
- Regular expressions are optimized to prevent ReDoS conditions
- Input processing includes safeguards against excessive computation

## Current Vulnerable Installations

✅ **Updated vulnerable installations in test fixtures**:
- `packages/static-build/test/fixtures/hexo-v5/`: ~~uses `marked@1.2.9`~~ **FIXED** - updated to use safe `hexo-renderer-marked@^6.0.0` 
- `packages/cli/test/dev/fixtures/07-hexo-node/`: ~~uses `marked@1.2.9`~~ **FIXED** - updated to use safe `hexo-renderer-marked@^6.0.0`

These fixtures have been updated to use `hexo-renderer-marked@^6.0.0` which depends on `marked@^4.3.0` (safe version).

## Recommendations

1. **Maintain current safe versions** marked@4.0.10 or later in all production code
2. **Update test fixtures** to use safe versions to prevent confusion
3. **Monitor** for new marked package releases and security advisories
4. **Use worker threads** with timeouts when processing untrusted markdown
5. **Keep the package overrides** to prevent accidental vulnerable installations

## References

- [marked.js documentation](https://marked.js.org/)
- [marked.js worker thread usage](https://marked.js.org/using_advanced#workers)
- [OWASP ReDoS Guide](https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS)
- [Security test file](./packages/cli/test/unit/util/marked-security.test.ts)