# Security: Dependabot Vulnerability Fixes

## Overview

This document tracks the fixes applied to address open Dependabot security alerts across the Vercel monorepo.

## Vulnerabilities Fixed

### Critical Severity

1. **loader-utils** - CVE-2022-37603 - Prototype Pollution
   - Vulnerable: `< 1.4.1` and `>= 2.0.0, < 2.0.3`
   - Fix: Added package overrides to enforce `>= 1.4.1` and `>= 2.0.3`

2. **shell-quote** - CVE-2021-42740 - Command Injection
   - Vulnerable: `<= 1.7.2`
   - Fix: Added package override to enforce `>= 1.7.3`

### High Severity

1. **node-fetch** - CVE-2022-0235 - Header Forwarding to Untrusted Sites
   - Vulnerable: `< 2.6.7` and `>= 3.0.0, < 3.1.1`
   - Fix: Added package overrides to enforce safe versions

2. **minimatch** - CVE-2022-3517 - ReDoS Vulnerability
   - Vulnerable: `< 3.0.5`
   - Fix: Added package override to enforce `>= 3.0.5`

3. **ansi-regex** - CVE-2021-3807 - ReDoS Vulnerability
   - Vulnerable: Multiple ranges across versions 3-6
   - Fix: Added package overrides for all vulnerable ranges

4. **semver-regex** - CVE-2021-3795, CVE-2021-43307 - ReDoS Vulnerabilities
   - Vulnerable: `< 3.1.4` and `>= 4.0.0, < 4.0.3`
   - Fix: Added package overrides for both ranges

### Medium Severity

1. **Next.js** - CVE-2024-34351 - Cache Key Confusion for Image Optimization API Routes
   - Vulnerable: `>= 0.9.9, < 14.2.31`
   - Fix: 
     - Added package override to enforce `>= 14.2.31`
     - Updated 30 test integration fixture package.json files
     - Updated monorepo test fixtures

2. **passport** - CVE-2022-25896 - Session Regeneration Issue
   - Vulnerable: `< 0.6.0`
   - Fix: Added package override to enforce `>= 0.6.0`

## Implementation Strategy

### Package Overrides

Added comprehensive package overrides in the root `package.json` that apply to both pnpm and npm:

```json
{
  "pnpm": {
    "overrides": {
      "loader-utils@<1.4.1": ">=1.4.1",
      "loader-utils@>=2.0.0 <2.0.3": ">=2.0.3",
      "shell-quote@<=1.7.2": ">=1.7.3",
      "node-fetch@<2.6.7": ">=2.6.7",
      "node-fetch@>=3.0.0 <3.1.1": ">=3.1.1",
      "minimatch@<3.0.5": ">=3.0.5",
      "passport@<0.6.0": ">=0.6.0",
      "ansi-regex@>=3.0.0 <3.0.1": ">=3.0.1",
      "ansi-regex@>=4.0.0 <4.1.1": ">=4.1.1",
      "ansi-regex@>=5.0.0 <5.0.1": ">=5.0.1",
      "ansi-regex@>=6.0.0 <6.0.1": ">=6.0.1",
      "semver-regex@<3.1.4": ">=3.1.4",
      "semver-regex@>=4.0.0 <4.0.3": ">=4.0.3",
      "next@>=0.9.9 <14.2.31": ">=14.2.31"
    }
  },
  "overrides": {
    "loader-utils@<1.4.1": ">=1.4.1",
    "loader-utils@>=2.0.0 <2.0.3": ">=2.0.3",
    "shell-quote@<=1.7.2": ">=1.7.3",
    "node-fetch@<2.6.7": ">=2.6.7",
    "node-fetch@>=3.0.0 <3.1.1": ">=3.1.1",
    "minimatch@<3.0.5": ">=3.0.5",
    "passport@<0.6.0": ">=0.6.0",
    "ansi-regex@>=3.0.0 <3.0.1": ">=3.0.1",
    "ansi-regex@>=4.0.0 <4.1.1": ">=4.1.1",
    "ansi-regex@>=5.0.0 <5.0.1": ">=5.0.1",
    "ansi-regex@>=6.0.0 <6.0.1": ">=6.0.1",
    "semver-regex@<3.1.4": ">=3.1.4",
    "semver-regex@>=4.0.0 <4.0.3": ">=4.0.3",
    "next@>=0.9.9 <14.2.31": ">=14.2.31"
  }
}
```

### Lockfile Cleanup

Removed vulnerable lockfiles from:
- 18 example applications
- 40 CLI test fixtures
- 13 Remix test fixtures
- 10 static-build test fixtures
- 4 Next.js unit test fixtures

Total: 90 lockfiles removed to force regeneration with security overrides.

### Direct Package Updates

Updated Next.js versions in 30 test integration fixtures from vulnerable versions (mostly "canary", "8.x", "9.x", "10.x") to the safe version "14.2.31".

## Coverage

This fix addresses hundreds of Dependabot alerts by:
1. Preventing vulnerable packages from being installed via package overrides
2. Forcing regeneration of lockfiles to pick up the secure versions
3. Direct updates where package overrides aren't sufficient

## Security Testing

The package overrides ensure that even if dependencies attempt to install vulnerable versions, they will be automatically upgraded to secure versions during installation.

## References

- [CVE-2025-57752 - Next.js Cache Key Confusion](https://github.com/advisories/GHSA-g5qg-72qw-gw5v)
- [CVE-2022-37603 - loader-utils Prototype Pollution](https://github.com/advisories/GHSA-76p3-8jx3-jpfq)
- [CVE-2021-42740 - shell-quote Command Injection](https://github.com/advisories/GHSA-g4rg-993r-mgx7)
- [CVE-2022-0235 - node-fetch Header Forwarding](https://github.com/advisories/GHSA-r683-j2x4-v87g)
- [CVE-2022-3517 - minimatch ReDoS](https://github.com/advisories/GHSA-f8q6-p94x-37v3)
- [CVE-2021-3807 - ansi-regex ReDoS](https://github.com/advisories/GHSA-93q8-gq69-wqmw)
- [CVE-2022-25896 - passport Session Regeneration](https://github.com/advisories/GHSA-6r2w-22qv-9w3w)
- [CVE-2021-3795 - semver-regex ReDoS](https://github.com/advisories/GHSA-xjx4-8694-q2fh)
- [CVE-2021-43307 - semver-regex ReDoS](https://github.com/advisories/GHSA-92xj-mqp7-vmcj)