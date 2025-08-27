# Cookie Security Validation

This module provides cookie validation utilities to prevent security vulnerabilities by validating cookie names, values, paths, and domains according to RFC 6265 standards.

## Security Issues Addressed

- **HTTP Response Splitting**: Prevents injection of control characters like `\r\n` that could be used to inject additional headers
- **Cookie Injection**: Validates that cookie names and values don't contain semicolons or other separator characters that could break cookie parsing
- **Domain Spoofing**: Ensures cookie domains follow proper domain name formatting rules
- **Path Traversal**: Validates that cookie paths start with `/` and don't contain dangerous characters

## Validation Rules

### Cookie Names
- Must only contain alphanumeric characters, hyphens, and underscores
- Cannot contain control characters (0-31, 127)
- Cannot contain separator characters: `()<>@,;:\"/?={}[]` or spaces

### Cookie Values
- Cannot contain control characters (0-31, 127)
- Cannot contain: `"`, `,`, `;`, `\`
- Empty values are allowed

### Cookie Paths
- Must start with `/` (except empty string which defaults to request path)
- Cannot contain control characters
- Cannot contain semicolons

### Cookie Domains
- Must be valid domain names
- Can start with `.` for subdomain matching
- Cannot contain consecutive dots
- Cannot start or end with hyphens
- Must contain at least one dot (except for `localhost`)

## Usage

The validation is automatically applied when parsing cookies from incoming requests. Invalid cookies are silently dropped to prevent security issues while maintaining backward compatibility.

## Testing

Run the validation tests with:
```bash
npm test -- cookie-validation.test.ts
```