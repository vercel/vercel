---
---

Remove the unused jest/puppeteer test toolchain from the `stencil-v4` static-build test fixture and re-enable its integration test. The fixture only runs `stencil build`, so puppeteer's postinstall Chromium download was dead weight that hung installs on hosts with an empty puppeteer cache.
