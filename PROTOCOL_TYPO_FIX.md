# Protocol Typo Detection Fix for Vercel CLI

## Problem Summary

Users frequently make typos when specifying protocols in alias commands, leading to confusing "Response Error (508)" messages instead of helpful feedback.

### Example from Bug Report

```bash
$ vercel alias dlp-gh4md8ujt-trail-security.vercel.app https:/dev.dlp.cyera.io --scope trail-security --debug
```

**Issue**: Missing `/` in `https:/` instead of `https://`

**Result**: Unhelpful 508 Loop Detected error from the API

## Solution

### 1. Enhanced Domain Validation (`packages/cli/src/util/to-host.ts`)

Added two new functions:

- **`correctProtocolTypos(url: string)`**: Automatically corrects common typos
- **`validateUrlProtocol(url: string)`**: Validates and provides helpful error messages

### 2. Early Detection in Alias Command (`packages/cli/src/commands/alias/set.ts`)

Added validation before API calls to catch typos early and provide helpful error messages.

## Common Typos Detected

| Typo | Correction | Error Type |
|------|------------|------------|
| `https:/domain.com` | `https://domain.com` | Missing slash after protocol |
| `http:/domain.com` | `http://domain.com` | Missing slash after protocol |
| `https:///domain.com` | `https://domain.com` | Extra slash in protocol |
| `https:domain.com` | `https://domain.com` | Missing slashes after protocol |

## User Experience Before vs After

### Before (Confusing)
```bash
$ vercel alias deployment.vercel.app https:/mydomain.com
Error: Response Error (508)
    at responseError (/path/to/vercel/index.js:41274:10)
```

### After (Helpful)
```bash
$ vercel alias deployment.vercel.app https:/mydomain.com
Error: Invalid protocol format in "https:/mydomain.com"
  Did you mean "https://mydomain.com"? (Missing slash after protocol)
```

## Implementation Details

### Auto-correction in `toHost()` Function

The `toHost()` function now automatically corrects common typos before processing:

```typescript
export default function toHost(url: string): string {
  // Auto-correct common protocol typos
  const correctedUrl = correctProtocolTypos(url);
  return correctedUrl.replace(/^(?:.*?\/\/)?([^/]+).*/, '$1');
}
```

### Validation in Alias Command

The alias command now validates protocols before making API calls:

```typescript
// Validate URL protocol for common typos
if (args.length >= 2) {
  const protocolValidation = validateUrlProtocol(args[1]);
  if (!protocolValidation.isValid && protocolValidation.error && protocolValidation.suggestion) {
    output.error(protocolValidation.error);
    output.print(`  ${protocolValidation.suggestion}\n`);
    return 1;
  }
}
```

## Benefits

1. **Better User Experience**: Clear, actionable error messages instead of cryptic 508 errors
2. **Faster Debugging**: Users immediately see what went wrong and how to fix it
3. **Reduced Support Burden**: Fewer confused users contacting support
4. **Prevention of API Errors**: Catches issues before they reach the API layer

## Testing

The fix includes comprehensive tests covering:
- Common protocol typos
- Auto-correction functionality
- Validation error messages
- Edge cases

## Files Modified

1. `packages/cli/src/util/to-host.ts` - Added validation and auto-correction
2. `packages/cli/src/commands/alias/set.ts` - Added early validation
3. `packages/cli/test/unit/util/to-host.test.ts` - Added comprehensive tests

## Addressing the Linear Issue

This fix directly addresses [FLOW-3915](https://linear.app/vercel/issue/FLOW-3915/show-a-more-helpful-error-when-a-user-typos-the-protocol-for-aliasing) by:

- Detecting protocol typos before they cause API errors
- Providing specific, actionable error messages
- Suggesting the correct format to users
- Handling the specific case mentioned in the Slack thread

The solution is user-friendly, developer-friendly, and prevents the confusing 508 errors that were frustrating customers.