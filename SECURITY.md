# Security Policy

## Reporting a Vulnerability

- <img height="16" width="16" src="https://cdn.simpleicons.org/gmail/black/white" /> camilo.pinto1@mail.udp.cl

## Known Security Measures

- **tmp Package Protection**: See [SECURITY-tmp.md](./SECURITY-tmp.md) for details on mitigations against symbolic link vulnerabilities in the tmp package.
- **JSZip Path Traversal Protection**: See [SECURITY-jszip.md](./SECURITY-jszip.md) for details on protections against JSZip loadAsync path traversal vulnerabilities.
- **XMLHttpRequest SSL Certificate Validation**: See [SECURITY-XMLHTTPREQUEST-SSL.md](./SECURITY-XMLHTTPREQUEST-SSL.md) for details on SSL certificate validation fixes.
- **Elliptic ECDSA Signature Validation**: See [SECURITY-elliptic.md](./SECURITY-elliptic.md) for details on ECDSA signature validation security measures.
- **Sentry SDK Prototype Pollution Protection**: See [SECURITY-prototype-pollution.md](./SECURITY-prototype-pollution.md) for details on prototype pollution prevention in Sentry SDK integration and object processing utilities.
