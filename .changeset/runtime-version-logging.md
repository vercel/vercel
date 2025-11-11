---
'@vercel/build-utils': minor
'@vercel/go': patch
'@vercel/python': patch
'@vercel/ruby': patch
---

Add runtime version logging for all build environments

- Log the runtime version being used during build (Node.js, Bun, Go, Ruby, Python)
- Show actual Node.js version (e.g., v22.11.0) when available in build environment
- Prevent duplicate logging when version detection is called multiple times
- Consistent messaging format: "Using [Runtime] [version] to build"
- Add test cases to verify deduplication works correctly
